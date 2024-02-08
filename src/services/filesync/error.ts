import { EditError } from "../app/edit/error.js";
import type { Context } from "../command/context.js";
import { sprintProblems, type Problems } from "../output/problems.js";
import { CLIError, IsBug } from "../output/report.js";
import { sprint, sprintln, sprintlns } from "../output/sprint.js";
import { isGraphQLErrors, isGraphQLResult, isObject, isString } from "../util/is.js";
import type { Directory } from "./directory.js";
import type { SyncJsonArgs } from "./sync-json.js";

export class YarnNotFoundError extends CLIError {
  isBug = IsBug.NO;

  constructor() {
    super("Yarn not found");
  }

  protected render(): string {
    return sprint`
      Yarn must be installed to sync your application. You can install it by running:

        $ npm install --global yarn

      For more information, see: https://classic.yarnpkg.com/en/docs/install
    `;
  }
}

export class UnknownDirectoryError extends CLIError {
  isBug = IsBug.NO;

  constructor(
    readonly ctx: Context<SyncJsonArgs>,
    readonly opts: { directory: Directory },
  ) {
    super('The ".gadget/sync.json" file was invalid or not found');
  }

  // TODO:
  // - make this async and check if the file exists so we can
  //   differentiate between invalid and missing
  // - add ctx.command so we know which command caused this error
  protected render(): string {
    const dir = this.opts.directory.path;
    const appSlug = this.ctx.app?.slug || "<name of app>";

    return sprint`
      We failed to find a ".gadget/sync.json" file in this directory:

        ${dir}

      If you're running "ggt dev" for the first time, we recommend
      using a gadget specific directory like this:

        ggt dev ~/gadget/${appSlug} --app=${appSlug}

      If you're certain you want to sync the contents of that directory
      to Gadget, run "ggt dev" again with the {bold --allow-unknown-directory} flag:

        ggt dev ${dir} --app=${appSlug} --allow-unknown-directory
    `;
  }
}

export class TooManySyncAttemptsError extends CLIError {
  isBug = IsBug.MAYBE;

  constructor(readonly attempts: number) {
    super(`Failed to sync files after ${attempts} attempts.`);
  }

  protected render(): string {
    return sprint`
        We synced your local files with Gadget ${this.attempts} times, but
        your local filesystem is still out of sync.

        Make sure no one else is editing files in the Gadget editor
        and try again.
    `;
  }
}

export class DeployDisallowedError extends CLIError {
  isBug = IsBug.MAYBE;

  constructor(readonly fatalErrors: Problems) {
    super("This application is not allowed to be deployed due to fatal errors.");
  }

  protected render(): string {
    let output = "\n";
    output += sprintlns`{red Gadget has detected the following fatal errors with your files:}`;
    output += sprintProblems({ problems: this.fatalErrors, showFileTypes: false });
    output += sprintln("");
    output += sprint`{red Please fix these errors and try again.}`;
    return output;
  }
}

export const isFilesVersionMismatchError = (error: unknown): boolean => {
  if (error instanceof EditError) {
    error = error.cause;
  }
  if (isGraphQLResult(error)) {
    error = error.errors;
  }
  if (isGraphQLErrors(error)) {
    error = error[0];
  }
  return isObject(error) && "message" in error && isString(error.message) && error.message.includes("Files version mismatch");
};

export const swallowFilesVersionMismatch = (ctx: Context, error: unknown): void => {
  if (isFilesVersionMismatchError(error)) {
    ctx.log.debug("swallowing files version mismatch", { error });
    return;
  }
  throw error;
};
