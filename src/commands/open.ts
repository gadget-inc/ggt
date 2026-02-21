import open from "open";

import type { Run } from "../services/command/command.js";

import { getModels } from "../services/app/app.js";
import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError } from "../services/command/arg.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { select } from "../services/output/select.js";
import { sprint } from "../services/output/sprint.js";
import { sortBySimilar } from "../services/util/collection.js";
import { isNever } from "../services/util/is.js";

export const description = "Open a Gadget location in your browser";

export const positional = "[LOCATION] [model_name]";

export const examples = [
  "ggt open",
  "ggt open logs",
  "ggt open permissions",
  "ggt open data post",
  "ggt open schema post",
  "ggt open data --show-all",
] as const;

export type OpenArgs = typeof args;

export const args = {
  ...AppIdentityArgs,
  "--show-all": { type: Boolean, description: "Show all available locations" },
};

export const longDescription = [
  "This command opens a specific Gadget page in your browser, allowing you to directly access",
  "various parts of your application's interface such as logs, permissions, data views, or",
  "schemas.",
].join("\n");

export const sections = [
  {
    title: "Locations",
    content: [
      "LOCATION specifies the part of Gadget to open. By default it opens the app's home page:",
      "",
      "  logs          Opens logs",
      "  permissions   Opens permissions",
      "  data          Opens data editor for a specific model",
      "  schema        Opens schema editor for a specific model",
    ].join("\n"),
  },
] as const;

export const run: Run<OpenArgs> = async (ctx, args) => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const appIdentity = await AppIdentity.load(ctx, { command: "open", args, directory });

  const location = args._[0] as Location | undefined;
  if (!location) {
    await open(`https://${appIdentity.environment.application.primaryDomain}/edit/${appIdentity.environment.name}`);
    println`
      Opened editor for environment {cyanBright ${appIdentity.environment.name}}.
    `;
    return;
  }

  if (!Locations.includes(location)) {
    const [closest] = sortBySimilar(location, Locations);
    throw new ArgError(sprint`
      Unknown location {yellow ${location}}

      Did you mean {blueBright ${closest}}?

      Run "ggt open --help" for usage
    `);
  }

  switch (location) {
    case "logs": {
      await open(`https://${appIdentity.environment.application.primaryDomain}/edit/${appIdentity.environment.name}/logs`);
      println`
        Opened log viewer for environment {cyanBright ${appIdentity.environment.name}}.
      `;
      break;
    }
    case "permissions": {
      await open(`https://${appIdentity.environment.application.primaryDomain}/edit/${appIdentity.environment.name}/settings/permissions`);
      println`
        Opened permissions settings for environment {cyanBright ${appIdentity.environment.name}}.
      `;
      break;
    }
    case "data":
    case "schema": {
      const view = args._[0];
      const remoteModelApiIdentifiers = (await getModels(ctx, appIdentity.environment)).map((e) => e.apiIdentifier);

      let modelApiIdentifier = args._[1];
      if (!modelApiIdentifier) {
        if (args["--show-all"]) {
          modelApiIdentifier = await select({ choices: remoteModelApiIdentifiers, content: "Which model do you wish to open?" });
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

      await open(
        `https://${appIdentity.environment.application.primaryDomain}/edit/${appIdentity.environment.name}/model/${modelApiIdentifier}/${view}`,
      );
      println`
        Opened ${view} viewer for environment {cyanBright ${appIdentity.environment.name}} for model {cyanBright ${modelApiIdentifier}}.
      `;
      break;
    }
    default:
      isNever(location);
  }
};

const Locations = ["logs", "permissions", "data", "schema"] as const;

type Location = (typeof Locations)[number];
