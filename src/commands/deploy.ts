import { AppArg } from "src/services/args.js";
import { EditGraphQL } from "src/services/edit-graphql.js";
import { FileSync, REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "src/services/filesync.js";
import { println, println2, sprint } from "src/services/output.js";
import { getUserOrLogin } from "src/services/user.js";
import type { RootArgs } from "./root.js";
import arg from "arg";
import { PromiseSignal } from "src/services/promise.js";
import { Action, SyncStatus } from "./sync.js";
import { select } from "src/services/prompt.js";
import ora from "ora";
import chalk from "chalk";

export const usage = sprint`
    The description for deploying

    {bold USAGE}
      $ ggt deploy

    {bold EXAMPLES}
      {gray $ ggt deploy}
      You have successfully deployed.
`;

const argSpec = {
    "-a": "--app",
    "--app": AppArg,
    "--force": Boolean
}

export class Deploy {
  /**
   * A GraphQL client connected to the app's /edit/api/graphql-ws endpoint
   */
  graphql!: EditGraphQL;
  
  /**
   * Handles writing files to the local filesystem.
   */
  filesync!: FileSync;
  
  /**
   * The current status of the sync process.
   */
  status = SyncStatus.STARTING;
    
  force: Boolean = false;
  
  args: any;
  
  async init(rootArgs: RootArgs): Promise<void> {
    const user = await getUserOrLogin();
    
    this.args = (arg(argSpec, { argv: rootArgs._ }))
    // this is where we create/initialize the FileSync object responsible for doing the actual syncing
    // we're not using this for syncing, but we do need to do the same checking that lives in FileSync.init
    // should refactor that out?
    this.filesync = await FileSync.init(user, {
        dir: this.args._[0],
        app: this.args["--app"],
        force: this.args["--force"],
        extraIgnorePaths: [".gadget"],
      });
    
    // this is where we create/initialize the GraphQL client that is connected to our websocket endpoint
    this.graphql = new EditGraphQL(this.filesync.app);
    
  }
  
  async run(): Promise<void> {
    const signal = new PromiseSignal();
    let prevProgress: string | undefined;
    const spinner = ora()
    
    // subscribes to the graphql subscription that will listen and send back the server contract status
    const unsubscribe = this.graphql.subscribe(
      {
        query: REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION,
        variables: () => ({localFilesVersion: String(this.filesync.filesVersion), force: this.args["--force"]})
      },
      {
        error: (error) => {
          // console.error("[jenny] Subscription error:", error);
        },
        next: async ({publishServerContractStatus}) => {
          const contractStatus = publishServerContractStatus?.progress;
          
          // console.log("[jenny] data is", JSON.stringify(publishServerContractStatus, undefined, 4))
          
          if(contractStatus === "ALREADY_SYNCING"){
            println2(`
            ${""}
            ${chalk.inverse("Detected a sync already in progress. Good bye!")}
            `)
            return
          }

          if(contractStatus === "NOT_STARTED"){
            println(`
                ${""}
                ${chalk.underline("Problems detected")}
                ${publishServerContractStatus?.missingProductionShopifyConfig ? ' • Add Shopify keys for production' : ''}
                ${publishServerContractStatus?.missingProductionGoogleAuthConfig ? ' • Add Google keys for production' : ''}
                ${publishServerContractStatus?.missingProductionOpenAIConnectionConfig ? ' • Add OpenAI keys for production' : ''}
                ${publishServerContractStatus?.isUsingOpenAIGadgetManagedKeys ? ' • Limitations apply to Gadget\'s OpenAI keys' : ''}
            `.trimEnd());
                        
            !this.args["--force"] && signal.resolve();

          }else{
            if(contractStatus === "COMPLETED"){
              spinner.succeed("DONE")
              println("")
              println2(`Deploy completed. Good bye!`)
              return
            }
  
            const currentProgress = AppDeploymentStepsToAppDeployState(contractStatus);

            if(contractStatus && currentProgress !== prevProgress ){
              if(contractStatus !== "STARTING"){
                spinner.succeed("DONE")
              }
              
              prevProgress = currentProgress;
              println("")
              println(`${currentProgress} ...`)              
              spinner.start(`Working ...`)

            }
          }
        },
        
      }
    )
      
    await signal;
    unsubscribe();
    
    println("")
    let action: Action | undefined;
    
    action = await select({
      message: "Detected some issues with your app. How would you like to proceed?",
      choices: [Action.CANCEL, Action.DEPLOY_ANYWAYS],
    });
    
    switch (action) {
      case Action.DEPLOY_ANYWAYS:{
        this.args["--force"] = true;
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }
    
    if(this.args["--force"]){
      this.run();
    }

  }
}

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

const deploy = new Deploy();
export const init = deploy.init.bind(deploy);
export const run = deploy.run.bind(deploy);
