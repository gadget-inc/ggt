import open from "open";

import { getModels } from "../services/app/app.js";
import { AppIdentity, AppIdentityFlags } from "../services/command/app-identity.js";
import { defineCommand } from "../services/command/command.js";
import { FlagError } from "../services/command/flag.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import colors from "../services/output/colors.js";
import { println } from "../services/output/print.js";
import { select } from "../services/output/select.js";
import { sprint } from "../services/output/sprint.js";
import { closestMatch } from "../services/util/collection.js";
import { isNever } from "../services/util/is.js";

const Locations = ["logs", "permissions", "data", "schema"] as const;

type Location = (typeof Locations)[number];

export default defineCommand({
  name: "open",
  description: "Open your app in a browser",
  details: sprint`
    Opens the Gadget web editor for your app by default. The data and schema locations require a model
    name or ${colors.subdued("--show-all")} to pick from a list.
  `,
  sections: [
    {
      title: "Locations",
      content: sprint`
        location specifies the part of Gadget to open. By default it opens the app's editor.

          logs          Opens the log viewer for your environment.
          permissions   Opens the permissions settings page.
          data          Opens the data editor for a specific model.
          schema        Opens the schema editor for a specific model.
      `,
    },
  ],
  examples: [
    "ggt open",
    "ggt open logs",
    "ggt open permissions",
    "ggt open data post",
    "ggt open schema post",
    "ggt open data --show-all",
    "ggt open schema --show-all",
    "ggt open data post --app myBlog --env staging",
  ],
  positionals: [
    {
      name: "location",
      description: "Page to open: logs, permissions, data, or schema",
      details: "One of: logs, permissions, data, schema. Opens the app editor when omitted.",
    },
    {
      name: "model",
      description: "Model name for data or schema locations",
      details: "Required for data and schema locations. Use --show-all to pick from a list instead.",
    },
  ],
  flags: {
    ...AppIdentityFlags,
    "--show-all": {
      type: Boolean,
      description: "Prompt to pick a model from the full list",
      details: "Displays an interactive picker with all models in your app. Useful when you don't remember the exact model name.",
    },
  },
  run: async (ctx, flags) => {
    const directory = await loadSyncJsonDirectory(process.cwd());
    const appIdentity = await AppIdentity.load(ctx, { command: "open", flags, directory });

    const locationArg = flags._[0];
    if (!locationArg) {
      await open(`https://${appIdentity.environment.application.primaryDomain}/edit/${appIdentity.environment.name}`);
      println`
        Opened editor for environment ${colors.code(appIdentity.environment.name)}.
      `;
      return;
    }

    if (!Locations.includes(locationArg as Location)) {
      throw new FlagError(
        sprint`
          Unknown location ${colors.warning(locationArg)}

          Did you mean ${colors.identifier(closestMatch(locationArg, Locations))}?
        `,
      );
    }

    const location: Location = locationArg as Location;

    switch (location) {
      case "logs": {
        await open(`https://${appIdentity.environment.application.primaryDomain}/edit/${appIdentity.environment.name}/logs`);
        println`
          Opened log viewer for environment ${colors.code(appIdentity.environment.name)}.
        `;
        break;
      }
      case "permissions": {
        await open(
          `https://${appIdentity.environment.application.primaryDomain}/edit/${appIdentity.environment.name}/settings/permissions`,
        );
        println`
          Opened permissions settings for environment ${colors.code(appIdentity.environment.name)}.
        `;
        break;
      }
      case "data":
      case "schema": {
        const remoteModelApiIdentifiers = (await getModels(ctx, appIdentity.environment)).map((e) => e.apiIdentifier);

        let modelApiIdentifier = flags._[1];
        if (!modelApiIdentifier) {
          if (flags["--show-all"]) {
            modelApiIdentifier = await select({ choices: remoteModelApiIdentifiers, content: "Which model do you wish to open?" });
          } else {
            throw new FlagError(
              sprint`
                "ggt open ${location}" requires a model to be specified.

                Run with "--show-all" to choose from available models.

                  ggt open ${location} --show-all
              `,
              { usageHint: false },
            );
          }
        }

        if (!remoteModelApiIdentifiers.includes(modelApiIdentifier)) {
          throw new FlagError(
            sprint`
              Unknown model ${colors.warning(modelApiIdentifier)}

              Did you mean ${colors.identifier(closestMatch(modelApiIdentifier, remoteModelApiIdentifiers))}?

              Run with "--show-all" to choose from available models.

                ggt open ${location} --show-all
            `,
            { usageHint: false },
          );
        }

        await open(
          `https://${appIdentity.environment.application.primaryDomain}/edit/${appIdentity.environment.name}/model/${modelApiIdentifier}/${location}`,
        );
        println`
          Opened ${location} viewer for environment ${colors.code(appIdentity.environment.name)} for model ${colors.code(modelApiIdentifier)}.
        `;
        break;
      }
      default:
        isNever(location);
    }
  },
});
