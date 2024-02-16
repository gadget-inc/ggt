import fs from "fs-extra";
import { EditError } from "../app/edit/error.js";
import type { Context } from "../command/context.js";
import { sprint, sprintln } from "../output/print.js";
import { printProblems, type Problems } from "../output/problems.js";
import { CLIError, IsBug } from "../output/report.js";
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

  protected render(): string {
    const dir = this.opts.directory.path;
    const appSlug = this.ctx.app?.slug || "<name of app>";
    const cmd = this.ctx.command;
    const exists = fs.existsSync(this.opts.directory.absolute(".gadget/sync.json"));

    if (exists) {
      // the file exists, but it's invalid JSON or is missing a required
      // piece of data. this can only happen if someone manually edits
      // the file, which is unlikely, so we don't need to be too helpful
      return sprint`
        The ".gadget/sync.json" file in this directory is invalid:

          ${dir}

        You can either fix the file manually or run "ggt dev" with the
        {bold --allow-unknown-directory} flag to recreate it.
      `;
    }

    // the file doesn't exist
    if (cmd === "dev") {
      // this is dev, which is used to initialize a new directory
      // so we should be helpful and tell the user what to do
      return sprint`
        A ".gadget/sync.json" file is missing in this directory:

          ${dir}

        If you're running "ggt dev" for the first time, we recommend
        using a gadget specific directory like this:

          ggt dev ~/gadget/${appSlug} --app=${appSlug}

        To use a non-empty directory without a ".gadget/sync.json" file,
        run "ggt dev" again with the {bold --allow-unknown-directory} flag:

          ggt dev ${dir} --app=${appSlug} --allow-unknown-directory
      `;
    }

    // this is push, pull, or deploy which must be run within a
    // directory that has already has .gadget/sync.json file
    return sprint`
      A ".gadget/sync.json" file is missing in this directory:

        ${dir}

      In order to use "ggt ${cmd}", you must run it within a directory
      that has already been initialized with "ggt dev".
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
    let output = sprintln`{red Gadget has detected the following fatal errors with your files:}`;
    output += sprintln("");
    output += printProblems({ toStr: true, problems: this.fatalErrors, showFileTypes: false });
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
