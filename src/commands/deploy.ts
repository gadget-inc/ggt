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
          
          // console.log("[jenny] data is", JSON.stringify(publishServerContractStatus, undefined, 4))
          
          if(publishServerContractStatus?.progress === "ALREADY_SYNCING"){
            println("❗ Detected a sync already in progress. Good bye!")
            return
          }

          if(publishServerContractStatus?.missingProductionShopifyConfig || publishServerContractStatus?.missingProductionGoogleAuthConfig || publishServerContractStatus?.missingProductionOpenAIConnectionConfig || publishServerContractStatus?.isUsingOpenAIGadgetManagedKeys){
            println2`❗ Problems detected`
            
            if(publishServerContractStatus?.missingProductionShopifyConfig){
              println("• Add shopify keys for production")
            }
            
            if(publishServerContractStatus?.missingProductionGoogleAuthConfig){
              println("• Add google keys for production")
            }
            
            if(publishServerContractStatus?.missingProductionOpenAIConnectionConfig){
              println("• Add OpenAI keys for production")
            }
            
            if(publishServerContractStatus?.isUsingOpenAIGadgetManagedKeys){
              println("• Limitations apply to Gadget's OpenAI keys")
            }
                        
            if(!this.args["--force"]){
              signal.resolve();
             }
          }
          
          if(["STARTING", "BUILDING_ASSETS", "UPLOADING_ASSETS", "CONVERGING_STORAGE", "PUBLISHING_TREE", "RELOADING_SANDBOX"].includes(publishServerContractStatus?.progress ?? "")){
            println(`${publishServerContractStatus?.progress} ...`)
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

const deploy = new Deploy();
export const init = deploy.init.bind(deploy);
export const run = deploy.run.bind(deploy);