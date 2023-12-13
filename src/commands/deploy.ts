import arg from "arg";
import boxen from "boxen";
import chalk from "chalk";
import ora from "ora";
import { AppArg } from "../../src/services/app/arg.js";
import { REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "../../src/services/app/edit-graphql.js";
import { type Command, type Usage } from "../../src/services/command/command.js";
import { config } from "../../src/services/config/config.js";
import { FileSync } from "../../src/services/filesync/filesync.js";
import { isEqualHashes } from "../../src/services/filesync/hashes.js";
import { select } from "../../src/services/output/prompt.js";
import { sprint } from "../../src/services/output/sprint.js";
import { isGraphQLErrors } from "../../src/services/util/is.js";
import { getUserOrLogin } from "../services/user/user.js";

export const usage: Usage = () => sprint`
    Deploy your Gadget application's development source code to production.

    {bold USAGE}
      ggt deploy [DIRECTORY] [--app=<name>]

    {bold ARGUMENTS}
      DIRECTORY         The directory to sync files to (default: ".")

    {bold FLAGS}
      -a, --app=<name>  The Gadget application to sync files to
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

const argSpec = {
  "-a": "--app",
  "--app": AppArg,
  "--force": Boolean,
};

export enum Action {
  DEPLOY_ANYWAYS = "Deploy anyways",
  SYNC_ONCE = "Sync once",
  CANCEL = "Cancel (Ctrl+C)",
}

const AppDeploymentStepsToAppDeployState = (step: string | undefined): string => {
  switch (step) {
    case "ALREADY_SYNCING":
      return "A deploy is already in progress";
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
  ALREADY_DEPLOYING = "ALREADY_DEPLOYING",
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

export const command: Command = async (ctx, firstRun = true) => {
  const spinner = ora();
  let prevProgress: string | undefined = AppDeploymentStepsToAppDeployState("NOT_STARTED");
  let action: Action;

  const args = arg(argSpec, { argv: ctx.rootArgs._ });

  const filesync = await FileSync.init({
    user: await getUserOrLogin(),
    dir: args._[0],
    app: args["--app"],
  });

  const log = filesync.log.extend("deploy");

  if (firstRun) {
    log.println(
      boxen(
        sprint`
        ggt v${config.version}
  
        App         ${filesync.app.slug}
        Editor      https://${filesync.app.slug}.gadget.app/edit
        Playground  https://${filesync.app.slug}.gadget.app/api/graphql/playground
        Docs        https://docs.gadget.dev/api/${filesync.app.slug}
    
        Endpoints ${
          filesync.app.hasSplitEnvironments
            ? `
          • https://${filesync.app.primaryDomain}
          • https://${filesync.app.slug}--development.gadget.app`
            : `
          • https://${filesync.app.primaryDomain}`
        }
        `,
        {
          padding: 1,
          borderStyle: "round",
          dimBorder: true,
        },
      ),
    );
  }

  const { localHashes, gadgetHashes } = await filesync._getHashes();

  const upToDate = isEqualHashes(localHashes, gadgetHashes);

  if (!upToDate) {
    log.println(`
    ${""}
    ${chalk.bold(
      `Local files have diverged from remote. Run a sync once to converge your files or keep ${chalk.italic(
        "ggt sync",
      )} running in the background.`,
    )}
    `);

    action = await select({
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
  const unsubscribe = filesync.editGraphQL.subscribe({
    query: REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION,
    variables: () => ({ localFilesVersion: String(filesync.filesVersion), force: args["--force"] }),
    onError: (error) => {
      if (isGraphQLErrors(error.cause)) {
        log.println(`${error.cause[0]?.message}`);
      }
      log.error("failed to depoy", { error });
    },
    onData: async ({ publishStatus }): Promise<void> => {
      const { progress, issues } = publishStatus ?? {};

      if (progress === AppDeploymentSteps.ALREADY_DEPLOYING) {
        log.println(`
            ${""}
            ${chalk.red("Detected a sync already in progress. Please try again later.")}
            `);
        process.exit(0);
      }

      const hasIssues = issues?.length;

      if (firstRun && hasIssues) {
        log.println(`
                ${""}
                ${chalk.underline("Issues detected")}`);

        for (const issue of issues) {
          const message = issue.message.replace(/"/g, "");
          const nodeType = issue.node?.type;
          const nodeName = issue.node?.name;
          const nodeParent = issue.node?.parentApiIdentifier;

          log.printlns(
            `
                    • ${message}                                       
                      ${nodeType ? `${nodeType}: ${chalk.cyan(nodeName)}` : ""}                 ${
                        nodeParent ? `ParentResource: ${chalk.cyan(nodeParent)}` : ""
                      }
            `.trim(),
          );
        }

        if (!args["--force"]) {
          unsubscribe();

          action = await select({
            message: "Detected some issues with your app. How would you like to proceed?",
            choices: [Action.CANCEL, Action.DEPLOY_ANYWAYS],
          });

          switch (action) {
            case Action.DEPLOY_ANYWAYS: {
              args["--force"] = true;
              ctx.rootArgs._.push("--force");
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
        if (progress === AppDeploymentSteps.COMPLETED) {
          spinner.succeed("DONE");
          log.println("");
          log.println("Deploy completed. Good bye!");
          unsubscribe();
          return;
        }

        const currentProgress = AppDeploymentStepsToAppDeployState(progress);

        if (progress && currentProgress !== prevProgress) {
          if ((progress as AppDeploymentSteps) !== AppDeploymentSteps.STARTING) {
            spinner.succeed("DONE");
          }

          prevProgress = currentProgress;
          log.println("");
          log.println(`${currentProgress} ...`);
          spinner.start("Working ...");
        }
      }
    },
  });
};
