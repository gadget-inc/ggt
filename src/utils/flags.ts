import { Flags } from "@oclif/core";
import levenshtein from "fast-levenshtein";
import _ from "lodash";
import { dedent } from "ts-dedent";
import { context } from "./context.js";
import { FlagError } from "./errors.js";

export const app = Flags.custom({
  char: "a",
  name: "app",
  summary: "The Gadget application this command applies to.",
  helpValue: "<name>",
  parse: async (value: string) => {
    const parsed = /^(https:\/\/)?(?<name>[\w-]+)/.exec(value)?.groups?.["name"];
    if (!parsed)
      throw new FlagError(
        { char: "a", name: "app" },
        dedent`
          The -a, --app flag must be the application's slug or URL

          Examples:

            --app my-app
            --app my-app.gadget.app
            --app https://my-app.gadget.app
            --app https://my-app.gadget.app/edit
        `
      );

    const slug = parsed.endsWith("--development") ? parsed.slice(0, -"--development".length) : parsed;

    const availableApps = await context.getAvailableApps();
    const foundApp = availableApps.find((a) => a.slug == slug);
    if (foundApp) {
      return foundApp.slug;
    }

    throw new FlagError(
      { char: "a", name: "app" },
      availableApps.length > 0
        ? dedent`
              Unknown application:

                ${value}

              Did you mean one of these?

                ${_.sortBy(availableApps, (app) => levenshtein.get(app.slug, slug))
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
