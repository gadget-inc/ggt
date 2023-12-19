import chalk from "chalk";
import ora from "ora";
import { REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import type { ArgsDefinition } from "../services/command/arg.js";
import { type Command, type Usage } from "../services/command/command.js";
import { FileSync, FileSyncArgs } from "../services/filesync/filesync.js";
import { select } from "../services/output/prompt.js";
import { sprint } from "../services/output/sprint.js";
import { isCloseEvent, isGraphQLErrors } from "../services/util/is.js";

export const usage: Usage = () => sprint`
    Deploy your Gadget application's development source code to production.

    {bold USAGE}
      ggt deploy [DIRECTORY] [--app=<name>]

    {bold ARGUMENTS}
      DIRECTORY         The directory to sync files to and deploy (default: ".")

    {bold FLAGS}
      -a, --app=<name>  The Gadget application to deploy
          --force       Deploy the Gadget application regardless of any issues it may have

    {bold DESCRIPTION}
      Deploy allows you to deploy your current Gadget application in development to production.

      It detects if local files are up to date with remote and if the Gadget application
      is in a deployable state. If there are any issues, it will display them and ask if
      you would like to deploy anyways.

      Note:
        • If local files are not up to date or have not recently been synced with remote ones,
          you will be prompted to run a one-time sync to ensure the files remain consistent with
          what is on the remote.
        • You may wish to keep ggt sync running in the background before trying to run ggt deploy

    {bold EXAMPLE}
      $ ggt deploy ~/gadget/example --app example

      App         example
      Editor      https://example.gadget.app/edit
      Playground  https://example.gadget.app/api/graphql/playground
      Docs        https://docs.gadget.dev/api/example

      Endpoints
        • https://example.gadget.app
        • https://example--development.gadget.app


      Building frontend assets ...
      ✔ DONE

      Setting up database ...
      ✔ DONE

      Copying development ...
      ✔ DONE

      Restarting app ...
      ✔ DONE

      Deploy completed. Good bye!
`;

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
      // console.log("[jenny] data", publishStatus);
      const { progress, issues, status } = publishStatus ?? {};

      const hasIssues = issues?.length;

      if (firstRun && hasIssues) {
        ctx.log.printlns`{underline Issues detected}`;

        for (const issue of issues) {
          const message = issue.message.replace(/"/g, "");
          const nodeType = issue.node?.type;
          const nodeName = issue.node?.apiIdentifier ?? issue.node?.name;
          const nodeParent = issue.node?.parentApiIdentifier;

          ctx.log.printlns(
            `
                    • ${message}
                      ${nodeType ? `${nodeType}: ${chalk.cyan(nodeName)}` : ""}                 ${
                        nodeParent ? `ParentResource: ${chalk.cyan(nodeParent)}` : ""
                      }
            `.trim(),
          );
        }

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
        if (status?.code === "Errored") {
          spinner.fail("Failed");
          log.printlns`{red ${status.message}}`;
          log.printlns(
            `
            Cmd + Click: \u001b]8;;${status?.traceIdUrl}\u0007View Logs\u001b]8;;\u0007 
            `,
          );
          unsubscribe();
          return;
        }

        if (progress === AppDeploymentSteps.COMPLETED) {
          spinner.succeed("DONE");
          ctx.log.printlns`{green Deploy completed. Good bye!}`;
          ctx.log.printlns(
            `
            Cmd + Click: \u001b]8;;${status?.traceIdUrl}\u0007View Logs\u001b]8;;\u0007 
            `,
          );
          unsubscribe();
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
