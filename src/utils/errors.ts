import cleanStack from "clean-stack";
import { HTTPError } from "got";
import type { GraphQLError } from "graphql";
import { isArray, isBoolean, isError, isNil, isNumber, isString, noop, uniqBy } from "lodash";
import { serializeError as baseSerializeError } from "serialize-error";
import dedent from "ts-dedent";
import type { SetOptional } from "type-fest";
import { inspect } from "util";
import type { CloseEvent, ErrorEvent } from "ws";
import type Sync from "../commands/sync";
import type { Payload } from "./client";
import { context } from "./context";
import os from "os";
import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";

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
   * The Sentry event ID for this error.
   */
  sentryEventId = context.env.testLike ? "00000000-0000-0000-0000-000000000000" : randomUUID();

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

  async capture(): Promise<void> {
    if (this.isBug == IsBug.NO) return;

    const user = await context.getUser().catch(noop);

    Sentry.getCurrentHub().captureException(this, {
      event_id: this.sentryEventId,
      captureContext: {
        user: user ? { id: String(user.id), email: user.email, username: user.name } : undefined,
        tags: {
          applicationId: context.app?.id,
          arch: context.config.arch,
          isBug: this.isBug,
          code: this.code,
          environment: context.env.value,
          platform: context.config.platform,
          shell: context.config.shell,
          version: context.config.version,
        },
        contexts: {
          cause: this.cause ? serializeError(this.cause) : undefined,
          app: {
            command: `${context.config.bin} ${process.argv.slice(2).join(" ")}`,
            argv: process.argv,
          },
          device: {
            name: os.hostname(),
            family: os.type(),
            arch: os.arch(),
          },
          runtime: {
            name: process.release.name,
            version: process.version,
          },
        },
      },
    });

    await Sentry.flush(2000);
  }

  /**
   * Turns this error into a user-friendly message that explains what went wrong and how to fix it. A good write up of what an error should
   * look like can be found here: {@link https://clig.dev/#errors}
   */
  render(): string {
    const rendered = dedent`
      ${this.header()}

      ${this.body()}
    `;

    const footer = this.footer();
    if (!footer) return rendered;

    return dedent`
      ${rendered}

      ${footer}
    `;
  }

  protected header(): string {
    return `${this.code}: ${this.message}`;
  }

  protected footer(): string {
    if (this.isBug == IsBug.NO) return "";

    return dedent`
      ${this.isBug == IsBug.YES ? "This is a bug" : "If you think this is a bug"}, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=${this.sentryEventId}
    `;
  }

  protected abstract body(): string;
}

/**
 * Universal Error object to json blob serializer.
 * Wraps `serialize-error` with some handy stuff, like special support for Got HTTP errors
 */
export function serializeError(error: Error | string | unknown): Record<string, any> {
  let serialized = baseSerializeError(isArray(error) ? new AggregateError(error) : error);
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
  YES = "yes",
  NO = "no",
  MAYBE = "maybe",
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

  protected body(): string {
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

  override body(): string {
    if (isGraphQLErrors(this.cause)) {
      if (this.cause.length > 1) {
        const errors = uniqBy(this.cause, "message");

        let output = "Gadget responded with multiple errors:\n";
        for (let i = 0; i < errors.length; i++) {
          output += `\n  ${i + 1}. ${errors[i]?.message}`;
        }

        return output;
      } else {
        return dedent`
          Gadget responded with the following error:

            ${this.cause[0]?.message}
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

export class YarnNotFoundError extends BaseError {
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

export class FlagError<T extends { name: string; char?: string } = { name: string; char?: string }> extends BaseError {
  isBug = IsBug.NO;

  #message: string;

  constructor(readonly flag: T, readonly description: string) {
    const name = flag.char ? `-${flag.char}, --${flag.name}` : `--${flag.name}`;
    super("GGT_CLI_FLAG_ERROR", "");

    // oclif overwrites the message property, so we have to use different one...
    // https://github.com/oclif/core/blob/413592abca47ebedb2c006634a326bab325c26bd/src/parser/parse.ts#L317
    this.#message = `Invalid value provided for the ${name} flag`;
  }

  protected override header(): string {
    return `${this.code}: ${this.#message}`;
  }

  protected body(): string {
    return this.description;
  }
}

export class InvalidSyncFileError extends BaseError {
  isBug = IsBug.MAYBE;

  constructor(override readonly cause: unknown, readonly sync: Sync, readonly app: string | undefined) {
    super("GGT_CLI_INVALID_SYNC_FILE", "The .gadget/sync.json file was invalid or not found");
  }

  protected body(): string {
    return dedent`
      We failed to read the Gadget metadata file in this directory:

        ${this.sync.dir}

      If you're running \`ggt sync\` for the first time, we recommend using an empty directory such as:

        ~/gadget/${this.app || "<name of app>"}

      Otherwise, if you're sure you want to sync the contents of that directory to Gadget, run \`ggt sync\` again with the \`--force\` flag:

        $ ggt sync ${this.sync.argv.join(" ")} --force

      You will be prompted to either merge your local files with your remote ones or reset your local files to your remote ones.
    `;
  }
}

export class InvalidSyncAppFlagError extends FlagError {
  constructor(sync: Sync) {
    super(
      { name: "app", char: "a" },
      dedent`
        You were about to sync the following app to the following directory:

          ${sync.flags.app} → ${sync.dir}

        However, that directory has already been synced with this app:

          ${sync.metadata.app}

        If you're sure that you want to sync "${sync.flags.app}" to "${sync.dir}", run \`ggt sync\` again with the \`--force\` flag:

          $ ggt sync ${sync.argv.join(" ")} --force
      `
    );
  }
}

function isCloseEvent(e: any): e is SetOptional<CloseEvent, "target"> {
  return !isNil(e) && isString(e.type) && isNumber(e.code) && isString(e.reason) && isBoolean(e.wasClean);
}

function isErrorEvent(e: any): e is SetOptional<ErrorEvent, "target"> {
  return !isNil(e) && isString(e.type) && isString(e.message) && !isNil(e.error);
}

function isGraphQLErrors(e: any): e is readonly GraphQLError[] {
  return isArray(e) && e.every((e) => !isNil(e) && isString(e.message) && isArray(e.locations ?? []) && isArray(e.path ?? []));
}
