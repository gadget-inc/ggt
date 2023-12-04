import arg from "arg";
import cleanStack from "clean-stack";
import type { GraphQLError } from "graphql";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { dedent } from "ts-dedent";
import type { JsonObject } from "type-fest";
import type { CloseEvent, ErrorEvent } from "ws";
import type { Query } from "../app/edit-graphql.js";
import { env } from "../config/env.js";
import { sprintln } from "../output/sprint.js";
import { compact, uniq } from "../util/collection.js";
import { isCloseEvent, isError, isErrorEvent, isGraphQLErrors, isString } from "../util/is.js";
import { serializeError } from "../util/object.js";

export enum IsBug {
  YES = "yes",
  NO = "no",
  MAYBE = "maybe",
}

/**
 * Base class for all errors.
 */
export abstract class CLIError extends Error {
  /**
   * A GGT_CLI_SOMETHING human/machine readable unique identifier for this error.
   */
  code: string;

  /**
   * The Sentry event ID for this error.
   */
  sentryEventId = env.testLike ? "00000000-0000-0000-0000-000000000000" : randomUUID();

  /**
   * The underlying *thing* that caused this error.
   */
  cause?: unknown;

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
   * Constructs a CLIError from a cause.
   */
  static from(cause: unknown): CLIError {
    if (cause instanceof CLIError) {
      return cause;
    }
    if (cause instanceof arg.ArgError) {
      return new ArgError(cause.message);
    }
    return new UnexpectedError(cause);
  }

  /**
   * Turns this error into a user-friendly message that explains what
   * went wrong and how to fix it. A good write up of what an error
   * should look like can be found here:
   * {@link https://clig.dev/#errors}
   */
  render(): string {
    return compact([this.header(), this.body(), this.footer()]).join("\n\n");
  }

  protected header(): string {
    return `${this.code}: ${this.message}`;
  }

  protected footer(): string {
    if (this.isBug === IsBug.NO) {
      return "";
    }

    return dedent`
      ${this.isBug === IsBug.YES ? "This is a bug" : "If you think this is a bug"}, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=${this.sentryEventId}
    `;
  }

  protected abstract body(): string;
}

/**
 * Our "catch all" error.
 *
 * If this error is thrown, we almost certainly have a bug, and should
 * either fix it or add a more specific error so that we can provide
 * more useful information.
 */
export class UnexpectedError extends CLIError {
  isBug = IsBug.YES;

  constructor(override cause: unknown) {
    super("GGT_CLI_UNEXPECTED_ERROR", "An unexpected error occurred");
  }

  protected body(): string {
    if (isError(this.cause)) {
      return cleanStack(this.cause.stack ?? this.stack);
    }
    return this.stack;
  }
}

export class EditGraphQLError extends CLIError {
  isBug = IsBug.MAYBE;

  override cause: string | Error | readonly GraphQLError[] | CloseEvent | ErrorEvent;

  constructor(
    readonly query: Query<JsonObject>,
    cause: unknown,
  ) {
    super("GGT_CLI_CLIENT_ERROR", "An error occurred while communicating with Gadget");

    // ErrorEvent and CloseEvent aren't serializable, so we reconstruct
    // them into an object. We discard the `target` property because
    // it's large and not that useful
    if (isErrorEvent(cause)) {
      this.cause = {
        type: cause.type,
        message: cause.message,
        error: serializeError(cause.error),
      } as ErrorEvent;
    } else if (isCloseEvent(cause)) {
      this.cause = {
        type: cause.type,
        code: cause.code,
        reason: cause.reason,
        wasClean: cause.wasClean,
      } as CloseEvent;
    } else {
      assert(
        isString(cause) || isError(cause) || isGraphQLErrors(cause),
        "cause must be a string, Error, GraphQLError[], CloseEvent, or ErrorEvent",
      );
      this.cause = cause;
    }
  }

  override body(): string {
    if (isGraphQLErrors(this.cause)) {
      const errors = uniq(this.cause.map((x) => x.message));
      if (errors.length > 1) {
        let n = 1;
        return sprintln("Gadget responded with multiple errors:").concat(`\n  ${n++}. ${errors.join(`\n  ${n++}. `)}`);
      } else {
        return dedent`
          Gadget responded with the following error:

            ${errors[0]}
        `;
      }
    }

    if (isCloseEvent(this.cause)) {
      return "The connection to Gadget closed unexpectedly.";
    }

    if (isErrorEvent(this.cause) || isError(this.cause)) {
      return this.cause.message;
    }

    return this.cause;
  }
}

export class YarnNotFoundError extends CLIError {
  isBug = IsBug.NO;

  constructor() {
    super("GGT_CLI_YARN_NOT_FOUND", "Yarn not found");
  }

  protected body(): string {
    return dedent`
      Yarn must be installed to sync your application. You can install it by running:

        $ npm install --global yarn

      For more information, see: https://classic.yarnpkg.com/en/docs/install
    `;
  }
}

export class ArgError extends CLIError {
  isBug = IsBug.NO;

  constructor(message: string) {
    super("GGT_CLI_ARG_ERROR", message);
  }

  // eslint-disable-next-line lodash/prefer-constant
  protected override header(): string {
    return "";
  }

  protected override body(): string {
    return this.message;
  }
}

export class InvalidSyncFileError extends CLIError {
  isBug = IsBug.MAYBE;

  constructor(
    readonly dir: string,
    readonly app: string | undefined,
  ) {
    super("GGT_CLI_INVALID_SYNC_FILE", "The .gadget/sync.json file was invalid or not found");
    this.app ??= "<name of app>";
  }

  protected body(): string {
    return dedent`
      We failed to read the Gadget metadata file in this directory:

        ${this.dir}

      If you're running \`ggt sync\` for the first time, we recommend using an empty directory such as:

        ~/gadget/${this.app}

      Otherwise, if you're sure you want to sync the contents of that directory to Gadget, run \`ggt sync\` again with the \`--force\` flag:

        $ ggt sync --app ${this.app} ${this.dir} --force

      You will be prompted to either merge your local files with your remote ones or reset your local files to your remote ones.
    `;
  }
}
