import { ArgError } from "./errors.js";
import { sprint } from "./print.js";

/**
 * Parses a string value and returns a boolean value.
 *
 * @param value - The string value to parse.
 * @returns A boolean value representing the parsed value.
 */
export const parseBoolean = (value: string | null | undefined): boolean => {
  value ??= "";
  return ["true", "1"].includes(value.trim().toLowerCase());
};

/**
 * Parses the value of an application argument (-a/--app) and returns the
 * application's slug.
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
