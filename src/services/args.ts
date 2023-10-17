import _ from "lodash";
import { ArgError } from "./errors.js";
import { sprint } from "./output.js";

export const parseBoolean = (value: string | null | undefined) => {
  return _.includes(["true", "1"], _.toLower(_.trim(value ?? "")));
};

export const AppArg = (value: string, name: string) => {
  const slug = /^(https:\/\/)?(?<slug>[\w-]+?)(--development)?(\..*)?$/.exec(value)?.groups?.["slug"];
  if (slug) {
    return slug;
  }

  throw new ArgError(
    sprint`
      The ${name} option must be the application's slug or URL

      Examples:

        --${name} my-app
        --${name} my-app.gadget.app
        --${name} https://my-app.gadget.app
        --${name} https://my-app.gadget.app/edit
        --${name} https://my-app--development.gadget.app/edit
    `,
  );
};
