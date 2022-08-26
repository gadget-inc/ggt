import type { Config } from "@oclif/core";
import type { OptionFlag } from "@oclif/core/lib/interfaces";
import cleanStack from "clean-stack";
import { HTTPError } from "got/dist/source";
import type { GraphQLError } from "graphql";
import { isArray, isBoolean, isError, isNil, isNumber, isString, uniqBy } from "lodash";
import newGithubIssueUrl from "new-github-issue-url";
import { serializeError as baseSerializeError } from "serialize-error";
import dedent from "ts-dedent";
import type { SetOptional, Writable } from "type-fest";
import { inspect } from "util";
import type { CloseEvent, ErrorEvent } from "ws";
import type Sync from "../commands/sync";
import type { Payload } from "./client";

/**
 * Base class for all errors.
 *
 * Inspired by gadget's GadgetError and oclif's PrettyPrintableError.
 */
export abstract class BaseError extends Error {
  /**
   * A GGT_CLI_SOMETHING human/machine readable unique identifier for this error.
   */
  code: string;

  /**
   * The underlying *thing* that caused this error.
   */
  override cause?: any;

  /**
   * Assume the stack trace exists.
   */
  override stack!: string;

  /**
   * Indicates whether this error is considered a bug or not.
   */
  abstract isBug: IsBug;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Turns this error into a user-friendly message that explains what went wrong and how to fix it. A good write up of what an error should
   * look like can be found here: {@link https://clig.dev/#errors}
   */
  render(config: Config): string {
    const header = this.header(config);
    const body = this.body(config);
    const footer = this.footer(config);

    let output = "";
    if (header) output += header + "\n\n";
    if (body) output += body + "\n\n";
    if (footer) output += footer + "\n\n";

    return output;
  }

  protected header(_: Config): string {
    return `${this.code}: ${this.message}`;
  }

  protected footer(config: Config): string {
    switch (this.isBug) {
      case IsBug.NO:
        return "";
      case IsBug.MAYBE:
        return dedent`
          If you think this is a bug, please submit an issue using the link below.

          ${newGithubIssueUrl(this.issueOptions(config))}
        `;
      case IsBug.YES:
        return dedent`
          This is a bug :(

          Visit the link below to see if someone has already reported this issue.
          https://github.com/gadget-inc/ggt/issues?q=is%3Aissue+is%3Aopen+label%3Abug+${this.code}

          If nobody has, you can submit one using the link below.
          ---
          ${newGithubIssueUrl(this.issueOptions(config))}
        `;
    }
  }

  protected issueOptions(config: Config): newGithubIssueUrl.Options {
    const options = {
      repoUrl: "https://github.com/gadget-inc/ggt",
      title: `[BUG ${this.code}]: `,
      labels: ["bug"],
      body: dedent`
        ### Description
        [Please describe what you were doing when this error occurred]

        ### Command
        \`\`\`sh-session
        ${config.bin} ${process.argv.slice(2).join(" ")}
        \`\`\`

        ### Environment
        \`\`\`
        version: ${config.version}
        platform: ${config.platform}
        arch: ${config.arch}
        shell: ${config.shell}
        timestamp: ${new Date().toISOString()}
        \`\`\`

        ### Stack Trace
        \`\`\`
        ${cleanStack(this.stack)}
        \`\`\`
      `,
    };

    if (this.cause) {
      options.body += dedent`

        ### Cause
        \`\`\`json
        ${JSON.stringify(isError(this.cause) ? serializeError(this.cause) : this.cause, null, 2)}
        \`\`\`
      `;
    }

    return options;
  }

  protected abstract body(_: Config): string;
}

/**
 * Universal Error object to json blob serializer.
 * Wraps `serialize-error` with some handy stuff, like special support for Got HTTP errors
 */
export function serializeError(error: Error | string | unknown): Record<string, any> {
  let serialized = baseSerializeError(error);
  if (typeof serialized == "string") {
    serialized = { message: serialized };
  }

  if (error instanceof HTTPError && error.name === "RequestError") {
    delete serialized["timings"];
    serialized["options"] = { method: error.options.method, url: error.options.url.toJSON() };
    serialized["responseBody"] = inspect(error.response?.body);
  }

  return serialized;
}

export enum IsBug {
  NO,
  MAYBE,
  YES,
}

/**
 * Our "catch all" error. If this error is thrown, we almost certainly have a bug.
 *
 * Whenever possible, we should use a more specific error so that we can provide more useful information.
 */
export class UnexpectedError extends BaseError {
  isBug = IsBug.YES;

  constructor(override cause: Error) {
    super("GGT_CLI_UNEXPECTED_ERROR", "An unexpected error occurred");
  }

  protected body(_: Config): string {
    return cleanStack(this.cause.stack ?? this.stack);
  }
}

export class ClientError extends BaseError {
  isBug = IsBug.MAYBE;

  constructor(readonly payload: Payload<any, any>, override cause: string | Error | readonly GraphQLError[] | CloseEvent | ErrorEvent) {
    super("GGT_CLI_CLIENT_ERROR", "An error occurred while communicating with Gadget");

    // ErrorEvent and CloseEvent aren't serializable, so we reconstruct them into an object. We discard the `target` property because it's large and not that useful
    if (isErrorEvent(cause)) {
      this.cause = {
        type: cause.type,
        message: cause.message,
        error: serializeError(cause.error),
      } as any;
    } else if (isCloseEvent(cause)) {
      this.cause = {
        type: cause.type,
        code: cause.code,
        reason: cause.reason,
        wasClean: cause.wasClean,
      } as any;
    }
  }

  override body(_: Config): string {
    if (isGraphQLErrors(this.cause)) {
      if (this.cause.length > 1) {
        let output = "Gadget responded with multiple errors:";
        for (const error of uniqBy(this.cause, "message")) {
          output += `\n * ${error.message}`;
        }
        return output;
      } else {
        return dedent`
          Gadget responded with an unexpected error.

          ${this.cause[0]?.message}
        `;
      }
    }

    if (isCloseEvent(this.cause)) {
      return "The connection to Gadget closed unexpectedly.";
    }

    if (isErrorEvent(this.cause)) {
      return dedent`
          The connection to Gadget received an unexpected error.

          ${this.cause.message}
      `;
    }

    if (isError(this.cause)) {
      return dedent`
          An unexpected error occurred.

          ${this.cause.message}
      `;
    }

    return this.cause;
  }

  protected override issueOptions(config: Config): newGithubIssueUrl.Options {
    const options = super.issueOptions(config) as Writable<newGithubIssueUrl.Options>;
    options.body += dedent`

      ### GraphQL

      #### Query
      \`\`\`graphql
      ${this.payload.query}
      \`\`\`
    `;

    // mutations can have large/sensitive payloads, so we don't include them by default
    if (!this.payload.query.trimStart().startsWith("mutation")) {
      options.body += dedent`

        #### Variables
        \`\`\`json
        ${JSON.stringify(this.payload.variables, null, 2)}
        \`\`\`
        `;
    }

    return options;
  }
}

export class YarnNotFoundError extends BaseError {
  isBug = IsBug.NO;

  constructor() {
    super("GGT_CLI_YARN_NOT_FOUND", "Yarn not found");
  }

  protected body(_: Config): string {
    return dedent`
      Yarn is required to sync your application.

      Please install Yarn by running:

        $ npm install --global yarn

      For more information, see: https://classic.yarnpkg.com/en/docs/install
    `;
  }
}

export class FlagError extends BaseError {
  isBug = IsBug.NO;

  constructor(readonly flag: Partial<OptionFlag<unknown>>, readonly description: string) {
    const name = flag.char ? `-${flag.char}, --${flag.name}` : `--${flag.name}`;
    super("GGT_CLI_FLAG_ERROR", `Invalid value provided for the ${name} flag`);
  }

  protected body(_: Config): string {
    return this.description;
  }
}

export class InvalidSyncFileError extends BaseError {
  isBug = IsBug.MAYBE;

  constructor(override readonly cause: unknown, readonly sync: Sync, readonly app: string | undefined) {
    super("GGT_CLI_INVALID_SYNC_FILE", "The .ggt/sync.json file was invalid or not found");
  }

  protected body(_: Config): string {
    return dedent`
      We failed to read the Gadget metadata file in this directory:

        ${this.sync.dir}

      If you're running \`ggt sync\` for the first time, we recommend using an empty directory such as:

        ~/gadget/${this.app || "<name of app>"}

      Otherwise, if you're sure you want to sync the contents of "${
        this.sync.dir
      }" to Gadget, run \`ggt sync\` again with the \`--force\` flag:

        $ ggt sync ${this.sync.argv.join(" ")} --force

      You will be prompted to either merge your local files with your remote ones or reset your local files to your remote ones.
    `;
  }
}

function isCloseEvent(e: any): e is SetOptional<CloseEvent, "target"> {
  return !isNil(e) && isString(e.type) && isNumber(e.code) && isString(e.reason) && isBoolean(e.wasClean);
}

function isErrorEvent(e: any): e is SetOptional<ErrorEvent, "target"> {
  return !isNil(e) && isString(e.type) && isString(e.message) && isError(e.error);
}

function isGraphQLErrors(e: any): e is readonly GraphQLError[] {
  return isArray(e) && e.every((e) => !isNil(e) && isString(e.message) && isArray(e.locations) && isArray(e.path));
}
