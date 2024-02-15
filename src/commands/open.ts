import chalk from "chalk";
import open from "open";
import { getModels } from "../services/app/app.js";
import { ArgError } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { SyncJson, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { select } from "../services/output/prompt.js";
import { sprint, sprintln2, sprintlns2 } from "../services/output/sprint.js";
import { sortBySimilar } from "../services/util/collection.js";
import { args as PushArgs } from "./push.js";

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
    Open a specified Gadget location directly in your browser.

    {bold USAGE}

      ggt open [SUBCOMMAND] [--app=<name>] [--environment=<env>]
                 [--show-all]
    
    {bold EXAMPLES}
      $ ggt open logs
      $ ggt open permissions 
      $ ggt open data modelA
      $ ggt open data --show-all
      $ ggt open schema modelA
      $ ggt open schema --show-all
    
    {bold FLAGS}
      -a, --app=<name>      The application to open
      -e, --from=<env>      The environment to open
          --show-all        Shows all available models to open
    
    Run "ggt open --help" for more information.
    `;
  }

  return sprint`
    Open a specified Gadget location directly in your browser.

    {bold USAGE}

      ggt open [SUBCOMMAND] [--app=<name>] [--environment=<env>]
                 [--show-all]

    {bold SUBCOMMANDS}
      • logs
        The log viewer for the app on the current environment
      • permissions
        The permissions settings for the app on the current environment
      • data
        The data viewer for a specified model on the current environment
      • schema
        The schema viewer for a specified model on the current environment
    
    {bold EXAMPLES}

      $ ggt open logs
      $ ggt open permissions 
      $ ggt open data modelA
      $ ggt open data --show-all
      $ ggt open schema modelA
      $ ggt open schema --show-all

    {bold FLAGS}

      -a, --app, --application=<name>
        The application to open.

        Defaults to the application within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -e, --from, --env, --environment=<name>
        The development environment to open.

        Defaults to the environment within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      --show-all, 
        Shows a list of available models the user may select from to open
`;
};

export type OpenArgs = typeof args;

export const args = {
  ...PushArgs,
  "--show-all": { type: Boolean, alias: "--all" },
};

export const command: Command<OpenArgs> = async (ctx) => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { directory });
  if (!syncJson) {
    throw new UnknownDirectoryError(ctx, { directory });
  }

  if (ctx.args._.length === 0) {
    const possibleOpenSubcommands = ["logs", "data", "schema", "permissions"];

    throw new ArgError(
      sprintlns2`
    Missing {cyanBright subcommand} for ggt open {cyanBright [subcommand]}.
    Run {yellow ggt open -help} for more information or pass in a subcommand:
            `.concat(`  • ${chalk.cyanBright(possibleOpenSubcommands.join("\n  • "))}`),
    );
  }

  switch (ctx.args._[0]) {
    case "logs": {
      ctx.log.println`
    Opened log viewer for environment ${chalk.cyanBright(syncJson.env.name)} please check your browser.
  `;

      console.log(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/logs`);

      await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/logs`);

      break;
    }
    case "permissions": {
      ctx.log.println`
        Opened permissions settings for environment ${chalk.cyanBright(syncJson.env.name)} please check your browser.
      `;
      await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/settings/permissions`);
      break;
    }
    case "data":
    case "schema": {
      const view = ctx.args._[0];
      const modelApiIdentifier = ctx.args._[1];
      const remoteModelApiIdentifiers = (await getModels(ctx)).map((e) => e.apiIdentifier);

      if (ctx.args._.length !== 2) {
        if (ctx.args["--show-all"]) {
          const choice = await select(ctx, {
            message: "What model do you wish to open?",
            choices: remoteModelApiIdentifiers,
          });

          ctx.log.println`
        Opened ${view} viewer for environment ${chalk.cyanBright(syncJson.env.name)} for model ${chalk.cyanBright(choice)} please check your browser.
      `;
          await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/model/${choice}/${view}`);
          break;
        } else {
          throw new ArgError(
            sprintln2`
          Missing {cyanBright model} for ggt open ${view} {cyanBright [model]}. 
          Please pass in a model or run with {yellow --show-all} to choose from available models.`,
          );
        }
      }

      const [closest] = sortBySimilar(modelApiIdentifier ?? "", remoteModelApiIdentifiers);

      if (closest === modelApiIdentifier) {
        ctx.log.println`
        Opened ${view} viewer for environment ${chalk.cyanBright(syncJson.env.name)} for model ${chalk.cyanBright(modelApiIdentifier)} please check your browser.
      `;
        await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/model/${modelApiIdentifier}/${view}`);
        break;
      }

      ctx.log.println`
        Unknown model {yellow ${modelApiIdentifier}}
  
        Did you mean {blueBright ${closest}}?
        
        Run {gray ggt open --help} for usage or run command with {yellow --show-all} to see all available models
      `;
      break;
    }
    default:
      throw new ArgError(
        sprintln2`
           Invalid subcommand for ggt open. 
           Did you mean ggt open {cyanBright logs}, {cyanBright data}, {cyanBright schema} or {cyanBright permissions}?
           
           Run {yellow ggt open -help} for more information
        `,
      );
  }
};
