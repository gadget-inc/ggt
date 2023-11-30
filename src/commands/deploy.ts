import { sprint } from "src/services/output/sprint.js";
import { importCommandModule, type Command, type Usage } from "./command.js";
import { AppArg } from "src/services/app/arg.js";
import type { RootArgs } from "./root.js";
import arg from "arg";
import boxen from "boxen";
import { getUserOrLogin } from "../services/user/user.js";
import { Action, FileSync } from "src/services/filesync/filesync.js";
import { REMOTE_FILES_VERSION_QUERY, REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "src/services/app/edit-graphql.js";
import chalk from "chalk";
import { PromiseSignal } from "src/services/util/promise.js";
import ora from "ora";
import { select } from "src/services/output/prompt.js";
import { config } from "src/services/config/config.js";

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

export const command = (async (rootArgs: RootArgs, showedErrors = false) => {
  const signal = new PromiseSignal();
  const spinner = ora()
  let localFilesUpToDate = false;
  let prevProgress: string | undefined = AppDeploymentStepsToAppDeployState("NOT_STARTED");
  let action: Action | undefined;
    
  const args = (arg(argSpec, {argv: rootArgs._}))
  
  const filesync = await FileSync.init({
    user: await getUserOrLogin(),
    dir: args._[0],
    app: args["--app"],
    force: args["--force"],
  });
  
  const log = filesync.log.extend("deploy");
  
  const { remoteFilesVersion } = await filesync.editGraphQL.query({ query: REMOTE_FILES_VERSION_QUERY });
  
  if (BigInt(remoteFilesVersion) === filesync.filesVersion){
    localFilesUpToDate = true;
  }
  
  if(!showedErrors){
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
    
  await filesync.sync();
  
  if(localFilesUpToDate){
    // subscribes to the graphql subscription that will listen and send back the server contract status
    const unsubscribe = filesync.editGraphQL.subscribe(
      {
        query: REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION,
        variables: () => ({localFilesVersion: String(filesync.filesVersion), force: args["--force"]})
      },
      {
        error: (error) => {
        },
        next: async ({publishServerContractStatus}) => {
          const contractStatus = publishServerContractStatus?.progress;
                    
          if(contractStatus === "ALREADY_SYNCING"){
            log.println(`
            ${""}
            ${chalk.inverse("Detected a sync already in progress. Please try again later.")}
            `)
            return
          }
     
          if(!showedErrors){
            if(publishServerContractStatus?.problems){
              log.println(`
                ${""}
                ${chalk.underline("Errors detected")}`
              )
              
              for(const problemItem of publishServerContractStatus?.problems){
                const message = problemItem?.problem?.message.replace(/"/g, '');
                const nodeType = problemItem?.node?.type;
                const nodeName = problemItem?.node?.name;
                const nodeParent = problemItem?.node?.parentApiIdentifier;

                log.printlns(`
                  • ${message}
                      ${nodeType}: ${chalk.cyan(nodeName)}                ${nodeParent ? `Parent Resource: ${chalk.cyan(nodeParent)}` : ""}
                `)
              }
            }
            
            if(publishServerContractStatus?.isUsingOpenAIGadgetManagedKeys || publishServerContractStatus?.missingProductionGoogleAuthConfig || publishServerContractStatus?.missingProductionOpenAIConnectionConfig || publishServerContractStatus?.missingProductionShopifyConfig){
              log.printlns(`
              ${chalk.underline("Problems detected")}
              ${
                publishServerContractStatus?.missingProductionShopifyConfig ? '\n • Add Shopify keys for production' : ''
              }${
                publishServerContractStatus?.missingProductionGoogleAuthConfig ? '\n • Add Google keys for production' : ''
              }${
                publishServerContractStatus?.missingProductionOpenAIConnectionConfig ? '\n • Add OpenAI keys for production' : ''
              }${
                publishServerContractStatus?.isUsingOpenAIGadgetManagedKeys ? '\n • Limitations apply to Gadget\'s OpenAI keys' : ''
              }
            `.trim());
            }
                        
            !args["--force"] && signal.resolve();
            showedErrors = true;

          }else{
            if(contractStatus === "COMPLETED"){
              spinner.succeed("DONE")
              log.println("")
              log.println(`Deploy completed. Good bye!`)
              return
            }
  
            const currentProgress = AppDeploymentStepsToAppDeployState(contractStatus);

            if(contractStatus && currentProgress !== prevProgress ){
              if(contractStatus !== "STARTING"){
                spinner.succeed("DONE")
              }
              
              prevProgress = currentProgress;
              log.println("")
              log.println(`${currentProgress} ...`)              
              spinner.start(`Working ...`)
            }
          }
        },
      }
    )
      
    await signal;
    unsubscribe();
        
    action = await select({
      message: "Detected some issues with your app. How would you like to proceed?",
      choices: [Action.CANCEL, Action.DEPLOY_ANYWAYS],
    });
          
    switch (action) {
      case Action.DEPLOY_ANYWAYS:{
        args["--force"] = true;
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }

    if(args["--force"]){
      command({...rootArgs, _: [...rootArgs._, '--force=true']}, true);
    }
  }else{
    log.println(`
    ${""}
    ${chalk.bold(`Local files have diverged from remote. Run a sync once to converge your files or keep ${chalk.italic("ggt sync")} running in the background.`)}
    `)
    action = await select({
      message: "How would you like to proceed?",
      choices: [Action.CANCEL, Action.SYNC_ONCE],
    });
    
    switch(action){
      case Action.SYNC_ONCE: {
        const syncCommandModule = await importCommandModule("sync")
        syncCommandModule.command({
          ...rootArgs,
          _: [...rootArgs._, '--syncOnce=true']
        });
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }  
  } 
}) satisfies(Command)

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

