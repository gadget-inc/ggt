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

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Open a Gadget location in your browser.

      {bold USAGE}
        ggt open [LOCATION] [MODEL]

      {bold EXAMPLES}
        $ ggt open
        $ ggt open logs
        $ ggt open permissions
        $ ggt open data modelA
        $ ggt open schema modelA
        $ ggt open data --show-all
        $ ggt open schema --show-all

      {bold ARGUMENTS}
        LOCATION    The location to open
        MODEL       The model to open

      {bold FLAGS}
        -a, --app=<name>      The application to open
        -e, --env=<env>       The environment to open
            --show-all        Show all available models to open

      Run "ggt open --help" for more information.
    `;
  }

  return sprint`
    Open a Gadget location in your browser.

    {bold USAGE}

      ggt open [LOCATION] [MODEL] [--show-all]
               [--app=<name>] [--env=<name>]

    {bold EXAMPLES}

      $ ggt open
      $ ggt open logs
      $ ggt open permissions
      $ ggt open data modelA
      $ ggt open schema modelA
      $ ggt open data --show-all
      $ ggt open schema --show-all

    {bold ARGUMENTS}

      LOCATION
        The location to open in the browser.

        Can be one of the following:
          logs         The log viewer
          permissions  The permissions settings
          data         The data viewer for the chosen model
          schema       The schema viewer for the chosen model

        Defaults to opening the editor.

      MODEL
        The model to open in the browser.

        Only required for the "data" and "schema" locations.

    {bold FLAGS}

      -a, --app, --application=<name>
        The application to open.

        Defaults to the application within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -e, --env, --environment=<name>
        The environment to open.

        Defaults to the environment within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      --show-all
        Makes "ggt open" display available models to open rather than
        exiting with an error if a model is not specified.

        Defaults to false.

    Run "ggt open -h" for less information.
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
