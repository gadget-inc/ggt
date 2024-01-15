import chalk from "chalk";
import assert from "node:assert";
import ora from "ora";
import pluralize from "pluralize";
import terminalLink from "terminal-link";
import { REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import type { ArgsDefinition } from "../services/command/arg.js";
import { type Command, type Usage } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";
import { DeployDisallowedError } from "../services/filesync/error.js";
import { FileSync, FileSyncArgs } from "../services/filesync/filesync.js";
import { confirm } from "../services/output/prompt.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { isCloseEvent, isGraphQLErrors } from "../services/util/is.js";
import { groupProblemsByApiIdentifier } from "../services/util/problems-group.js";

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

export const command = (async (ctx, firstRun = true) => {
  // deploy --force != sync --force
  const filesync = await FileSync.init(ctx.child({ overwrite: { "--force": false } }));

  if (firstRun) {
    ctx.log.printlns`Deploying ${terminalLink(filesync.app.primaryDomain, `https://${filesync.app.primaryDomain}/`)}`;
  }

  const { inSync } = await filesync.hashes();
  if (!inSync) {
    ctx.log.printlns`
      Your local filesystem must be in sync with your development
      environment before you can deploy.
    `;

    await confirm(ctx, { message: "Would you like to sync now?" });
    await filesync.sync();
  }

  const spinner = ora();
  let prevProgress = AppDeploymentStepsToAppDeployState(AppDeploymentSteps.NOT_STARTED);

  // subscribes to the graphql subscription that will listen and send
  // back the server contract status
  const unsubscribe = filesync.edit.subscribe({
    subscription: REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION,
    variables: () => ({ localFilesVersion: String(filesync.filesVersion), force: ctx.args["--force"] }),
    onError: (error) => {
      ctx.log.error("failed to deploy", { error });
      spinner.fail();

      if (isCloseEvent(error.cause)) {
        ctx.log.printlns(error.message);
      } else if (isGraphQLErrors(error.cause)) {
        const message = error.cause[0]?.message;
        assert(message, "expected message to be defined");

        if (message.includes("GGT_PAYMENT_REQUIRED")) {
          ctx.log.println("Production environment limit reached. Upgrade your plan to deploy");
        } else {
          ctx.log.println(message);
        }
      }

      unsubscribe();
      return;
    },
    onData: async ({ publishStatus }): Promise<void> => {
      const { progress, issues, status } = publishStatus ?? {};

      const fileFatalErrors = issues?.filter((issue) => issue.severity === "Fatal");

      if (fileFatalErrors && fileFatalErrors.length > 0) {
        ctx.log.printlns`{red.underline Fatal errors detected}`;

        const problemsGroup = groupProblemsByApiIdentifier(
          fileFatalErrors.map((error) => ({ apiIdentifier: error.node?.apiIdentifier ?? "", message: error.message })),
        );

        await reportErrorAndExit(ctx, new DeployDisallowedError(problemsGroup));
      }

      if (firstRun && issues?.length) {
        ctx.log.printlns`{bold Issues found:}`;

        const issuesWithNoNode = issues.filter((item) => item.node?.apiIdentifier) as NodeIssue[];
        const groupedByApiIdentifier = groupByProperty(issuesWithNoNode, "apiIdentifier");
        printIssues(ctx, groupedByApiIdentifier);

        const remainingItems = issues.filter((item) => !item.node?.apiIdentifier) as NodeIssue[];
        const groupedByName = groupByProperty(remainingItems, "name");
        printIssues(ctx, groupedByName);

        if (!ctx.args["--force"]) {
          await confirm(ctx, { message: "Do you want to continue?" });
        }

        unsubscribe();
        ctx.args["--force"] = true;
        await command(ctx, false);
        return;
      }

      const handleCompletion = (message: string | null | undefined, color: "red" | "green"): void => {
        unsubscribe();

        if (color === "red") {
          spinner.fail();
        } else {
          spinner.succeed();
        }

        if (color === "green") {
          message = chalk.green(message);
          if (status?.output) {
            message += ` ${terminalLink("View logs", status.output)}`;
          }

          ctx.log.printlns(message);
        } else {
          ctx.log.printlns`{red ${message}}`;
          if (status?.output) {
            ctx.log.printlns(terminalLink("View logs", status.output));
          }
        }
      };

      if (status && "code" in status && status.code === "Errored") {
        handleCompletion(status.message, "red");
        return;
      }

      if (progress === AppDeploymentSteps.COMPLETED) {
        handleCompletion("Deploy successful!", "green");
        return;
      }

      const currentProgress = AppDeploymentStepsToAppDeployState(progress);
      if (progress && currentProgress !== prevProgress) {
        if (progress !== AppDeploymentSteps.STARTING) {
          spinner.succeed();
        }

        prevProgress = currentProgress;
        spinner.start(currentProgress);
      }
    },
  });
}) satisfies Command<typeof args>;

const AppDeploymentStepsToAppDeployState = (step: string | undefined): string => {
  switch (step) {
    case AppDeploymentSteps.NOT_STARTED:
      return "Deploy not started";
    case AppDeploymentSteps.STARTING:
    case AppDeploymentSteps.BUILDING_ASSETS:
    case AppDeploymentSteps.UPLOADING_ASSETS:
      return "Building frontend assets";
    case AppDeploymentSteps.CONVERGING_STORAGE:
      return "Setting up database";
    case AppDeploymentSteps.PUBLISHING_TREE:
      return "Copying development";
    case AppDeploymentSteps.RELOADING_SANDBOX:
      return "Restarting app";
    case AppDeploymentSteps.COMPLETED:
      return "Deploy completed";
    default:
      return "Unknown step";
  }
};

const AppDeploymentSteps = Object.freeze({
  NOT_STARTED: "NOT_STARTED",
  STARTING: "STARTING",
  BUILDING_ASSETS: "BUILDING_ASSETS",
  UPLOADING_ASSETS: "UPLOADING_ASSETS",
  CONVERGING_STORAGE: "CONVERGING_STORAGE",
  PUBLISHING_TREE: "PUBLISHING_TREE",
  RELOADING_SANDBOX: "RELOADING_SANDBOX",
  COMPLETED: "COMPLETED",
});

export type AppDeploymentSteps = (typeof AppDeploymentSteps)[keyof typeof AppDeploymentSteps];

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

type GroupedIssues = Record<string, NodeIssue[]>;

const groupByProperty = (items: NodeIssue[], property: string): GroupedIssues => {
  const grouped: GroupedIssues = {};
  const other = "Other";

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
      if (!grouped[other]) {
        grouped[other] = [];
      }
      grouped[other].push(item);
    }
  }

  return grouped;
};

const printIssues = (ctx: Context, groupedIssues: GroupedIssues): void => {
  for (const [name, issues] of Object.entries(groupedIssues)) {
    ctx.log.printlns`• {cyan ${name}} {redBright ${pluralize("issue", issues.length, true)}}`;
    for (const issue of issues) {
      if (!issue.node) {
        ctx.log.println`  {red ✖} ${issue.message}`;
        continue;
      }

      const [message, ...lines] = issue.message.split("\n") as [string, ...string[]];

      ctx.log.print`  {red ✖} `;
      if (issue.node.type === "SourceFile") {
        ctx.log.print`${filetype(issue.node.key)} ${message}`;
      } else {
        ctx.log.print(message);
      }

      for (const line of lines) {
        ctx.log.println("");
        ctx.log.print`    ${line}`;
      }

      for (const label of issue.nodeLabels ?? []) {
        ctx.log.print` {dim ${label.identifier}}`;
      }

      ctx.log.println("");
    }
  }
};

const jsExtensions = [".js", ".jsx", ".cjs", ".mjs"];
const tsExtensions = [".ts", ".tsx", ".cts", ".mts"];

export const isJSFile = (filepath: string): boolean => jsExtensions.some((e) => filepath.endsWith(e));
export const isTSFile = (filepath: string): boolean => tsExtensions.some((e) => filepath.endsWith(e) && !filepath.endsWith(".d.ts"));
export const isGellyFile = (filepath: string): boolean => filepath.endsWith(".gelly");

const filetype = (filename: string): string => {
  switch (true) {
    case isJSFile(filename):
      return chalk.yellowBright("JavaScript");
    case isTSFile(filename):
      return chalk.blue("TypeScript");
    case isGellyFile(filename):
      return chalk.magenta("Gelly");
    default:
      return chalk.gray("File");
  }
};
