import _ from "lodash";
import { ArgError } from "./errors.js";
import { sprint } from "./output.js";

export const parseBoolean = (value: string) => _.includes(["true", "1"], _.toLower(_.trim(value)));

export const App = (value: string, name: string) => {
  const slug = /^(https:\/\/)?(?<slug>[\w-]+?)(--development)?(\..*)?$/.exec(value)?.groups?.["slug"];
  if (slug) {
    return slug;
  }

  throw new ArgError(
    sprint`
      The ${name} option must be the application's slug or URL

      Examples:

        --app my-app
        --app my-app.gadget.app
        --app https://my-app.gadget.app
        --app https://my-app.gadget.app/edit
        --app https://my-app--development.gadget.app/edit
    `,
  );
};
