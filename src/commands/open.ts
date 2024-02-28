import chalk from "chalk";
import open from "open";
import { getModels } from "../services/app/app.js";
import { ArgError } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println, sprint } from "../services/output/print.js";
import { select } from "../services/output/select.js";
import { sortBySimilar } from "../services/util/collection.js";

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
        -e, --env=<env>       The environment to open
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

    Run "ggt open -h" for less information.
  `;
};

export type OpenArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--show-all": { type: Boolean },
};

export const command: Command<OpenArgs> = async (ctx) => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { directory });
  if (!syncJson) {
    throw new UnknownDirectoryError(ctx, { directory });
  }

  if (ctx.args._.length === 0) {
    println`
      Opened editor for environment ${chalk.cyanBright(syncJson.env.name)} please check your browser.
    `;
    await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}`);
    return;
  }

  switch (ctx.args._[0]) {
    case "logs": {
      println`
        Opened log viewer for environment ${chalk.cyanBright(syncJson.env.name)} please check your browser.
      `;
      await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/logs`);

      break;
    }
    case "permissions": {
      println`
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
          const choice = await select({ choices: remoteModelApiIdentifiers })("What model do you wish to open?");
          println`
            Opened ${view} viewer for environment ${chalk.cyanBright(syncJson.env.name)} for model ${chalk.cyanBright(choice)} please check your browser.
          `;
          await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/model/${choice}/${view}`);
          break;
        } else {
          throw new ArgError(sprint`
            Missing {cyanBright model} for ggt open ${view} {cyanBright [model]}.
            Please pass in a model or run with {yellow --show-all} to choose from available models.
          `);
        }
      }

      const [closest] = sortBySimilar(modelApiIdentifier ?? "", remoteModelApiIdentifiers);

      if (closest === modelApiIdentifier) {
        println`
          Opened ${view} viewer for environment ${chalk.cyanBright(syncJson.env.name)} for model ${chalk.cyanBright(modelApiIdentifier)} please check your browser.
        `;
        await open(`https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/model/${modelApiIdentifier}/${view}`);
        break;
      }

      println`
        Unknown model {yellow ${modelApiIdentifier}}

        Did you mean ggt open model {blueBright ${closest}}?

        Run {gray ggt open --help} for usage or run command with {yellow --show-all} to see all available models
      `;
      break;
    }
    default:
      throw new ArgError(sprint`
          Invalid subcommand for ggt open.
          Did you mean ggt open {cyanBright logs}, {cyanBright data}, {cyanBright schema} or {cyanBright permissions}?

          Run {yellow ggt open --help} for more information
      `);
  }
};
