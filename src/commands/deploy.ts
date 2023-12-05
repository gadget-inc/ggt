import arg from "arg";
import boxen from "boxen";
import chalk from "chalk";
import ora from "ora";
import { AppArg } from "../../src/services/app/arg.js";
import { REMOTE_FILES_VERSION_QUERY, REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION, REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "../../src/services/app/edit-graphql.js";
import { config } from "../../src/services/config/config.js";
import { Action, FileSync } from "../../src/services/filesync/filesync.js";
import { select } from "../../src/services/output/prompt.js";
import { sprint } from "../../src/services/output/sprint.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { getUserOrLogin } from "../services/user/user.js";
import { importCommandModule, type Command, type Usage } from "./command.js";
import type { RootArgs } from "./root.js";
import dayjs from "dayjs";
import { printChanges } from "src/services/filesync/changes.js";
import path from "node:path";
import { execa } from "execa";

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

/**
 * Runs the deploy process.
 */

export const command = (async (rootArgs: RootArgs, firstRun = true) => {
  const signal = new PromiseSignal();
  const spinner = ora();
  let localFilesUpToDate = false;
  let prevProgress: string | undefined = AppDeploymentStepsToAppDeployState("NOT_STARTED");
  let action: Action | undefined;

  const args = arg(argSpec, { argv: rootArgs._ });

  const filesync = await FileSync.init({
    user: await getUserOrLogin(),
    dir: args._[0],
    app: args["--app"],
    force: args["--force"],
  });

  const log = filesync.log.extend("deploy");

  const { remoteFilesVersion } = await filesync.editGraphQL.query({ query: REMOTE_FILES_VERSION_QUERY });

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

  // check if the local and remote files are up to date and prompt them how to handle if not
  const result = await filesync.sync();
  
  if(result === 0){
    // if the user chose to reset their local files, we have to subscribe to get the latest 
    const recentWritesToLocalFilesystem = new Map<string, number>();

    const signal2 = new PromiseSignal();

    /**
     * Gracefully stops the sync.
     */
    const stop = async (): Promise<void> => {

      try {
        unsubscribeFromGadgetChanges();
        await filesync.idle();
      } catch (error) {
        log.error("error while stopping", { error });
      } finally {
        log.info("stopped");
      }
      signal2.resolve();
    };
    
    const unsubscribeFromGadgetChanges = filesync.subscribeToGadgetChanges({
      onError: (error) => console.log(error),
      beforeChanges: ({ changed, deleted }) => {
        // add all the files and directories we're about to touch to
        // recentWritesToLocalFilesystem so that we don't send them back
        // to Gadget
        for (const filepath of [...changed, ...deleted]) {
          recentWritesToLocalFilesystem.set(filepath, Date.now());

          let dir = path.dirname(filepath);
          while (dir !== ".") {
            recentWritesToLocalFilesystem.set(dir + "/", Date.now());
            dir = path.dirname(dir);
          }
        }
      },
      afterChanges: async ({ changes }) => {
        if (changes.has("yarn.lock")) {
          await execa("yarn", ["install", "--check-files"], { cwd: filesync.directory.path }).catch((error) => {
            log.error("yarn install failed", { error });
          });
        }
        
        if(true){
          log.println("Ran a sync.")
          stop();
        }
      },
      opts: {
        syncOnce: true,
        signal: () => stop(),
      }
    });
    
    /// await the subscription to close
    await signal2;
  }
 
  // at this point everything should be up to date
  if (BigInt(remoteFilesVersion) === filesync.filesVersion) {
    localFilesUpToDate = true;
  }

  if (localFilesUpToDate) {
    // subscribes to the graphql subscription that will listen and send back the server contract status
    const unsubscribe = filesync.editGraphQL.subscribe(
      {
        query: REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION,
        variables: () => ({ localFilesVersion: String(filesync.filesVersion), force: args["--force"] }),
      },
      {
        error: (error) => {
          log.error("failed to depoy", { error });
        },
        next: async ({ publishServerContractStatus }) => {
          const {
            progress,
            problems,
            isUsingOpenAIGadgetManagedKeys,
            missingProductionGoogleAuthConfig,
            missingProductionOpenAIConnectionConfig,
            missingProductionShopifyConfig,
          } = publishServerContractStatus || {};

          if (progress === "ALREADY_SYNCING") {
            log.println(`
            ${""}
            ${chalk.red("Detected a sync already in progress. Please try again later.")}
            `);
            return;
          }

          if (firstRun) {
            if (problems?.length) {
              log.println(`
                ${""}
                ${chalk.underline("Errors detected")}`);

              for (const problemItem of problems) {
                const message = problemItem?.problem?.message.replace(/"/g, "");
                const nodeType = problemItem?.node?.type;
                const nodeName = problemItem?.node?.name;
                const nodeParent = problemItem?.node?.parentApiIdentifier;

                log.printlns(`
                  • ${message}
                      ${nodeType}: ${chalk.cyan(nodeName)}                  ${nodeParent ? `ParentResource: ${chalk.cyan(nodeParent)}` : ""}
                `);
              }
            }

            if (
              isUsingOpenAIGadgetManagedKeys ||
              missingProductionGoogleAuthConfig ||
              missingProductionOpenAIConnectionConfig ||
              missingProductionShopifyConfig
            ) {
              log.printlns(
                `
              ${chalk.underline("Problems detected")}
              ${missingProductionShopifyConfig ? "\n • Add Shopify keys for production" : ""}${
                missingProductionGoogleAuthConfig ? "\n • Add Google keys for production" : ""
              }${missingProductionOpenAIConnectionConfig ? "\n • Add OpenAI keys for production" : ""}${
                isUsingOpenAIGadgetManagedKeys ? "\n • Limitations apply to Gadget's OpenAI keys" : ""
              }
            `.trim(),
              );
            }

            !args["--force"] && signal.resolve();
            firstRun = false;
          } else {
            if (progress === "COMPLETED") {
              spinner.succeed("DONE");
              log.println("");
              log.println(`Deploy completed. Good bye!`);
              return;
            }

            const currentProgress = AppDeploymentStepsToAppDeployState(progress);

            if (progress && currentProgress !== prevProgress) {
              if (progress !== "STARTING") {
                spinner.succeed("DONE");
              }

              prevProgress = currentProgress;
              log.println("");
              log.println(`${currentProgress} ...`);
              spinner.start(`Working ...`);
            }
          }
        },
      },
    );

    await signal;
    unsubscribe();

    action = await select({
      message: "Detected some issues with your app. How would you like to proceed?",
      choices: [Action.CANCEL, Action.DEPLOY_ANYWAYS],
    });

    switch (action) {
      case Action.DEPLOY_ANYWAYS: {
        args["--force"] = true;
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }

    if (args["--force"]) {
      command({ ...rootArgs, _: [...rootArgs._, "--force=true"] }, false);
    }
  } else {
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
        const syncCommandModule = await importCommandModule("sync");
        syncCommandModule.command({
          ...rootArgs,
          _: [...rootArgs._, "--once=true"],
        });
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }
  }
}) satisfies Command;

export const AppDeploymentStepsToAppDeployState = (step: string | undefined) => {
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

