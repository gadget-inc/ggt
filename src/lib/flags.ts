import { Flags } from "@oclif/core";
import levenshtein from "fast-levenshtein";
import { sortBy } from "lodash";
import dedent from "ts-dedent";
import { api } from "./api";
import { FlagError } from "./errors";

export const app = Flags.custom({
  char: "a",
  name: "app",
  summary: "The Gadget application this command applies to.",
  parse: async (value: string) => {
    const name = /^(https:\/\/)?(?<name>[\w-]+)(\..*)?/.exec(value)?.groups?.["name"];
    if (!name)
      throw new FlagError(
        app,
        dedent`
          The -a, --app flag must be the application's name, slug, or URL

          Examples:

            --app my-app
            --app my-app.gadget.app
            --app https://my-app.gadget.app
            --app https://my-app.gadget.app/edit
        `
      );

    const availableApps = await api.getApps();
    const foundApp = availableApps.find((a) => a.name == name || a.slug == name);
    if (foundApp) {
      return foundApp.slug;
    }

    throw new FlagError(
      app,
      availableApps.length > 0
        ? dedent`
              Unknown application:

                ${value}

              Did you mean one of these?

                ${sortBy(availableApps, (app) => levenshtein.get(app.slug, name))
                  .slice(0, 10)
                  .map((app) => `* ${app.slug}`)
                  .join("\n")}
            `
        : dedent`
              Unknown application:

                ${value}

              It doesn't look like you have any applications.

              Visit https://gadget.new to create one!
            `
    );
  },
});
