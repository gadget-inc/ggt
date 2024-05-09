import open from "open";
import { getModels } from "../services/app/app.js";
import { ArgError } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { select } from "../services/output/select.js";
import { sprint } from "../services/output/sprint.js";
import { sortBySimilar } from "../services/util/collection.js";
import { isNever } from "../services/util/is.js";

export type OpenArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--show-all": { type: Boolean },
};

export const usage: Usage = (_ctx) => {
  return sprint`
  This command opens a specific Gadget page in your browser, allowing you to directly access
  various parts of your application's interface such as logs, permissions, data views, or
  schemas.

  {gray Usage}
        ggt open [LOCATION] [model_name] [--show-all] [options]
  
        LOCATION: specifies the part of Gadget to open, by default it'll open the apps home page:

        + logs                Opens logs
        + permissions         Opens permissions
        + data                Opens data editor for a specific model
        + schema              Opens schema editor for a specific model

  {gray Options}
        -a, --app <app_name>   Selects the application to open in your browser. Default set on ".gadget/sync.json"
        -e, --env <env_name>   Selects the environment to open in your browser. Default set on ".gadget/sync.json"
        --show-all             Shows all schema, or data options by listing your available models
  
  {gray Examples}
        Opens editor home
        {cyanBright $ ggt open}

        Opens logs 
        {cyanBright $ ggt open logs} 
        
        Opens permissions
        {cyanBright $ ggt open permissions}
        
        Opens data editor for the 'post' model
        {cyanBright $ ggt open data post}
        
        Opens schema for 'post' model
        {cyanBright $ ggt open schema post}
        
        Shows all models available in the data editor
        {cyanBright $ ggt open data -show-all}
        
        Shows all models available in the schema viewer
        {cyanBright $ ggt open schema --show-all}
        
        Opens data editor for 'post' model of app 'myBlog' in the 'staging' environment 
        {cyanBright $ ggt open data post --app myBlog --env staging}
  `;
};

export const command: Command<OpenArgs> = async (ctx) => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { directory });
  if (!syncJson) {
    throw new UnknownDirectoryError(ctx, { directory });
  }

  const location = ctx.args._[0] as Location | undefined;
  if (!location) {
    await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}`);
    println`
      Opened editor for environment {cyanBright ${syncJson.env.name}}.
    `;
    return;
  }

  if (!Locations.includes(location)) {
    const [closest] = sortBySimilar(location, Locations);
    throw new ArgError(sprint`
      Unknown location {yellow ${location}}

      Did you mean {blueBright ${closest}}?

      Run "ggt open -h" for usage.
    `);
  }

  switch (location) {
    case "logs": {
      await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/logs`);
      println`
        Opened log viewer for environment {cyanBright ${syncJson.env.name}}.
      `;
      break;
    }
    case "permissions": {
      await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/settings/permissions`);
      println`
        Opened permissions settings for environment {cyanBright ${syncJson.env.name}}.
      `;
      break;
    }
    case "data":
    case "schema": {
      const view = ctx.args._[0];
      const remoteModelApiIdentifiers = (await getModels(ctx)).map((e) => e.apiIdentifier);

      let modelApiIdentifier = ctx.args._[1];
      if (!modelApiIdentifier) {
        if (ctx.args["--show-all"]) {
          modelApiIdentifier = await select({ choices: remoteModelApiIdentifiers })("Which model do you wish to open?");
        } else {
          throw new ArgError(sprint`
            "ggt open ${view}" requires a model to be specified.

            Run with "--show-all" to choose from available models.

              ggt open ${view} --show-all
          `);
        }
      }

      if (!remoteModelApiIdentifiers.includes(modelApiIdentifier)) {
        const [closest] = sortBySimilar(modelApiIdentifier, remoteModelApiIdentifiers);
        throw new ArgError(sprint`
          Unknown model {yellow ${modelApiIdentifier}}

          Did you mean {blueBright ${closest}}?

          Run with "--show-all" to choose from available models.

            ggt open ${view} --show-all
        `);
      }

      await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/model/${modelApiIdentifier}/${view}`);
      println`
        Opened ${view} viewer for environment {cyanBright ${syncJson.env.name}} for model {cyanBright ${modelApiIdentifier}}.
      `;
      break;
    }
    default:
      isNever(location);
  }
};

const Locations = ["logs", "permissions", "data", "schema"] as const;

type Location = (typeof Locations)[number];
