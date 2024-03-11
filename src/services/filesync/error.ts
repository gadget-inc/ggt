import { ClientError } from "../app/error.js";
import type { Context } from "../command/context.js";
import { sprintProblems, type Problems } from "../output/problems.js";
import { GGTError, IsBug } from "../output/report.js";
import { sprint, sprintln } from "../output/sprint.js";
import { isGraphQLErrors, isGraphQLResult, isObject, isString } from "../util/is.js";
import type { Directory } from "./directory.js";
import type { SyncJsonArgs } from "./sync-json.js";

export class YarnNotFoundError extends GGTError {
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

export class UnknownDirectoryError extends GGTError {
  isBug = IsBug.NO;

  constructor(
    readonly ctx: Context<SyncJsonArgs>,
    readonly opts: { directory: Directory },
  ) {
    super('The ".gadget/sync.json" file was invalid or not found');
  }

  protected render(): string {
    const cmd = this.ctx.command;
    const dir = this.opts.directory.path;

    switch (cmd) {
      case "open":
      case "status":
        return sprint`
          A ".gadget/sync.json" file is missing in this directory:

            ${dir}

          In order to use "ggt ${cmd}", you must run it within a directory
          that has already been initialized with "ggt dev".
        `;
      case "dev":
        return sprint`
          A ".gadget/sync.json" file is missing in this directory:

            ${dir}

          If you're running "ggt dev" for the first time, we recommend
          using a gadget specific directory like this:

            ggt dev ~/gadget/${this.ctx.args["--app"] ?? "<name>"}

          To use a non-empty directory without a ".gadget/sync.json" file,
          run "ggt dev" again with the "--allow-unknown-directory" flag:

            ggt dev ${dir} --allow-unknown-directory
        `;
      default:
        return sprint`
          A ".gadget/sync.json" file is missing in this directory:

            ${dir}

          If you're certain you want to use this directory, you can run
          "ggt ${cmd}" again with the "--allow-unknown-directory" flag:

            ggt ${cmd} --allow-unknown-directory
        `;
    }
  }
}

export class TooManyMergeAttemptsError extends GGTError {
  isBug = IsBug.MAYBE;

  constructor(readonly attempts: number) {
    super(`Failed to synchronize files after ${attempts} attempts.`);
  }

  protected render(): string {
    return sprint`
      We merged your local files with your environment's files ${this.attempts} times,
      but your local and environment's files still don't match.

      Make sure no one else is editing files on your environment, and try again.
    `;
  }
}

export class DeployDisallowedError extends GGTError {
  isBug = IsBug.MAYBE;

  constructor(readonly fatalErrors: Problems) {
    super("This application is not allowed to be deployed due to fatal errors.");
  }

  protected render(): string {
    let output = sprintln`{red Gadget has detected the following fatal errors with your files:}`;
    output += sprintProblems({ ensureEmptyLineAbove: true, problems: this.fatalErrors, showFileTypes: false });
    output += sprintln({ ensureEmptyLineAbove: true })`{red Please fix these errors and try again.}`;
    return output;
  }
}

export const isFilesVersionMismatchError = (error: unknown): boolean => {
  if (error instanceof ClientError) {
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
