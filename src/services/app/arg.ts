import { ArgError } from "../error/error.js";
import { sprint } from "../output/sprint.js";

/**
 * Parses the value of an application argument (-a/--app) and returns
 * the application's slug.
 *
 * @param value - The value of the argument.
 * @param name - The name of the argument. e.g. "-a" or "--app".
 * @returns The application's slug.
 * @throws {ArgError} If the value is not a valid slug or URL.
 */
export const AppArg = (value: string, name: string): string => {
  const slug = /^(https:\/\/)?(?<slug>[\w-]+?)(--development)?(\..*)?$/.exec(value)?.groups?.["slug"];
  if (slug) {
    return slug;
  }

  throw new ArgError(
    sprint`
      ${name} must be the application's {bold slug} or {bold URL}

      {bold EXAMPLES:}
        ${name} my-app
        ${name} my-app.gadget.app
        ${name} https://my-app.gadget.app
        ${name} https://my-app.gadget.app/edit
        ${name} https://my-app--development.gadget.app/edit
    `,
  );
};
