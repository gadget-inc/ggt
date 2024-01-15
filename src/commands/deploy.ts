import chalk from "chalk";
import ora from "ora";
import { REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import type { ArgsDefinition } from "../services/command/arg.js";
import { type Command, type Usage } from "../services/command/command.js";
import { FileSync, FileSyncArgs } from "../services/filesync/filesync.js";
import { select } from "../services/output/prompt.js";
import { sprint } from "../services/output/sprint.js";
import { isCloseEvent, isGraphQLErrors } from "../services/util/is.js";

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Deploy your development environment to production.

      {bold USAGE}
        ggt deploy [DIRECTORY]

      {bold ARGUMENTS}
        DIRECTORY         The directory to sync files from and deploy (default: ".")

      {bold EXAMPLES}
        $ ggt deploy
        $ ggt deploy ~/gadget/example
        $ ggt deploy ~/gadget/example --app=example
        $ ggt deploy ~/gadget/example --app=example --prefer=local

      {bold FLAGS}
        -a, --app=<name>          The Gadget application to deploy
            --prefer=<filesystem>  Prefer "local" or "gadget" conflicting changes
            --force                Deploy regardless of any issues found

      Run "ggt deploy --help" for more information.
    `;
  }

  return sprint`
    Deploy your development environment to production.

    Deploy ensures your directory is in sync with your development
    environment and that it is in a deployable state. If there are any
    issues, it will display them and ask if you would like to deploy
    anyways.

    {bold USAGE}
      ggt deploy [DIRECTORY] [--app=<name>] [--prefer=<filesystem>] [--force]

    {bold EXAMPLES}

      $ ggt deploy
      $ ggt deploy ~/gadget/example
      $ ggt deploy ~/gadget/example --app=example
      $ ggt deploy ~/gadget/example --app=example --prefer=local
      $ ggt deploy ~/gadget/example --app=example --prefer=local --force

    {bold ARGUMENTS}

      DIRECTORY
        The path to the directory to sync your development environment's
        files to before deploying it to your production environment.
        The directory will be created if it does not exist.

        Defaults to the current working directory. (default: ".")

    {bold FLAGS}

      -a, --app=<name>
        The Gadget application to deploy.

        If not provided, the application will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found, you will be
        prompted to choose an application from your list of apps.

      --prefer=<filesystem>
        Which filesystem's changes to automatically keep when
        conflicting changes are detected.

        If not provided, deploy will pause when conflicting changes are
        detected and you will be prompted to choose which changes to
        keep before deploy resumes.

        Must be one of "local" or "gadget".

      --force
        Deploy your development environment to production regardless
        of any issues it may have.

        These issues may include:
          • Syntax errors
          • TypeScript errors
          • Missing fields that should be present on models
`;
};

export const args = {
  ...FileSyncArgs,
} satisfies ArgsDefinition;

export enum Action {
  DEPLOY_ANYWAYS = "Deploy anyways",
  SYNC_ONCE = "Sync once",
  CANCEL = "Cancel (Ctrl+C)",
}

const AppDeploymentStepsToAppDeployState = (step: string | undefined): string => {
  switch (step) {
    case "NOT_STARTED":
      return "Deploy not started";
    case "STARTING":
    case "BUILDING_ASSETS":
    case "UPLOADING_ASSETS":
      return "Building frontend assets";
    case "CONVERGING_STORAGE":
      return "Setting up database";
    case "PUBLISHING_TREE":
      return "Copying development";
    case "RELOADING_SANDBOX":
      return "Restarting app";
    case "COMPLETED":
      return "Deploy completed";
    default:
      return "Unknown step";
  }
};

enum AppDeploymentSteps {
  NOT_STARTED = "NOT_STARTED",
  STARTING = "STARTING",
  BUILDING_ASSETS = "BUILDING_ASSETS",
  UPLOADING_ASSETS = "UPLOADING_ASSETS",
  CONVERGING_STORAGE = "CONVERGING_STORAGE",
  PUBLISHING_TREE = "PUBLISHING_TREE",
  RELOADING_SANDBOX = "RELOADING_SANDBOX",
  COMPLETED = "COMPLETED",
}

type Node = {
  [key: string]: string | undefined;
  type: string;
  key: string;
  apiIdentifier?: string;
  name?: string;
  fieldType?: string;
  parentKey?: string;
  parentApiIdentifier?: string;
};

type NodeLabel = {
  type: string;
  identifier: string;
};

type NodeIssue = {
  severity: string;
  message: string;
  node?: Node;
  nodeLabels?: NodeLabel[];
};

type PublishStatus = {
  code?: string;
  message?: string;
  output?: string;
};

type GroupedIssues = Record<string, NodeIssue[]>;

const groupByProperty = (items: NodeIssue[], property: string): GroupedIssues => {
  const grouped: GroupedIssues = {};
  const defaultOtherIssues = "Other Issues";

  for (const item of items) {
    if (item.node) {
      const value = item.node[property];

      if (value && !grouped[value]) {
        grouped[value] = [];
        grouped[value]?.push(item);
      } else if (value && grouped[value]) {
        grouped[value]?.push(item);
      }
    } else {
      if (!grouped[defaultOtherIssues]) {
        grouped[defaultOtherIssues] = [];
      }
      grouped[defaultOtherIssues].push(item);
    }
  }

  return grouped;
};

/**
 * Runs the deploy process.
 */
export const command = (async (ctx, firstRun = true) => {
  const spinner = ora();
  let prevProgress: string | undefined = AppDeploymentStepsToAppDeployState("NOT_STARTED");
  let action: Action;

  // deploy --force != sync --force
  const filesync = await FileSync.init(ctx.child({ overwrite: { "--force": false } }));

  if (firstRun) {
    ctx.log.printlns`App: ${filesync.app.slug}`;
  }

  const { inSync } = await filesync.hashes();
  if (!inSync) {
    ctx.log.printlns`
      Local files have diverged from remote. Run a sync once to converge your files or keep {italic ggt sync} running in the background.
    `;

    action = await select(ctx, {
      message: "How would you like to proceed?",
      choices: [Action.CANCEL, Action.SYNC_ONCE],
    });

    switch (action) {
      case Action.SYNC_ONCE: {
        await filesync.sync();

        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }
  }

  // subscribes to the graphql subscription that will listen and send back the server contract status
  const unsubscribe = filesync.edit.subscribe({
    subscription: REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION,
    variables: () => ({ localFilesVersion: String(filesync.filesVersion), force: ctx.args["--force"] }),
    onError: (error) => {
      if (isCloseEvent(error.cause)) {
        spinner.fail("Failed");
        ctx.log.printlns(error.message);
      } else if (isGraphQLErrors(error.cause)) {
        const message = error.cause[0]?.message;
        if (message && message.includes("GGT_PAYMENT_REQUIRED")) {
          ctx.log.println("Production environment limit reached. Upgrade your plan to deploy");
        } else {
          ctx.log.println(`${message}`);
        }
      }
      ctx.log.error("failed to deploy", { error });
      unsubscribe();
      return;
    },
    onData: async ({ publishStatus }): Promise<void> => {
      const { progress, issues, status } = publishStatus ?? {};

      const hasIssues = issues?.length;

      if (firstRun && hasIssues) {
        ctx.log.printlns`{underline Issues detected}`;

        const printIssues = (groupedIssues: GroupedIssues): void => {
          for (const [name, nodeArray] of Object.entries(groupedIssues)) {
            ctx.log.println(
              `\n\n • ${chalk.cyan(name)} ${chalk.redBright(
                nodeArray.length === 1 ? `${nodeArray.length} issue` : `${nodeArray.length} issues`,
              )}${nodeArray
                .map((e) => {
                  if (!e.node) {
                    return `\n\t   ${chalk.red("✖")} ${e.message}`;
                  }

                  return `\n\t   ${chalk.red("✖")} ${titleFormatter(e)}: ${e.nodeLabels
                    ?.map((label: NodeLabel) => `${chalk.bgWhite.black(label.type.toLowerCase())} ${chalk.white.bold(label.identifier)}`)
                    .join("")}`;
                })
                .join("")}`,
            );
          }
        };

        const titleFormatter = (e: NodeIssue): string => {
          if (e.node?.type === "SourceFile") {
            return `${chalk.magentaBright("Typescript")} ${e.message.replace(/[.,]+$/, "")}`;
          }
          return e.message.replace(/[.,]+$/, "");
        };

        const issuesWithNoNode = issues.filter((item) => item.node?.apiIdentifier) as NodeIssue[];
        const groupedByApiIdentifier = groupByProperty(issuesWithNoNode, "apiIdentifier");
        printIssues(groupedByApiIdentifier);

        const remainingItems = issues.filter((item) => !item.node?.apiIdentifier) as NodeIssue[];
        const groupedByName = groupByProperty(remainingItems, "name");
        printIssues(groupedByName);

        if (!ctx.args["--force"]) {
          unsubscribe();

          action = await select(ctx, {
            message: "Detected some issues with your app. How would you like to proceed?",
            choices: [Action.CANCEL, Action.DEPLOY_ANYWAYS],
          });

          switch (action) {
            case Action.DEPLOY_ANYWAYS: {
              ctx.args["--force"] = true;
              await command(ctx, false);
              break;
            }
            case Action.CANCEL: {
              process.exit(0);
            }
          }
        }

        firstRun = false;
      } else {
        const publishStatus = status ? (status as PublishStatus) : undefined;

        const handleCompletion = (message: string | null | undefined, color: string): void => {
          spinner.stopAndPersist({
            symbol: color === "red" ? chalk.red("✖") : chalk.greenBright("✔"),
            text: color === "red" ? "Failed" : "DONE",
          });

          ctx.log.printlns(color === "red" ? chalk.red(message) : chalk.green(message));
          if (publishStatus?.output) {
            ctx.log.printlns(`Cmd/Ctrl + Click: \u001b]8;;${publishStatus.output}\u0007View Logs\u001b]8;;\u0007`);
          }
          unsubscribe();
        };

        if (publishStatus && "code" in publishStatus && publishStatus.code === "Errored") {
          handleCompletion(publishStatus.message, "red");
          return;
        }

        if (progress === AppDeploymentSteps.COMPLETED) {
          handleCompletion("Deploy completed. Good bye!", "green");
          return;
        }

        const currentProgress = AppDeploymentStepsToAppDeployState(progress);

        if (progress && currentProgress !== prevProgress) {
          if ((progress as AppDeploymentSteps) !== AppDeploymentSteps.STARTING) {
            spinner.succeed("DONE");
          }

          prevProgress = currentProgress;
          ctx.log.printlns(`${currentProgress} ...`);
          spinner.start("Working ...");
        }
      }
    },
  });
}) satisfies Command<typeof args>;
