import * as Sentry from "@sentry/node";
import arg from "arg";
import cleanStack from "clean-stack";
import { RequestError } from "got";
import type { GraphQLError } from "graphql";
import { compact, uniqBy } from "lodash";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { inspect, isArray, isError } from "node:util";
import { serializeError as baseSerializeError, type ErrorObject } from "serialize-error";
import { dedent } from "ts-dedent";
import type { JsonObject, SetOptional } from "type-fest";
import type { CloseEvent, ErrorEvent } from "ws";
import { z } from "zod";
import type { App } from "./app.js";
import { config, env } from "./config.js";
import type { Payload } from "./edit-graphql.js";
import type { User } from "./user.js";

let app: App | undefined;
let user: User | undefined;

export const setUser = (newUser: User | undefined): void => {
  user = newUser;
  // eslint-disable-next-line unicorn/no-null
  Sentry.setUser(newUser ?? null);
};

export const setApp = (newApp: App | undefined): void => {
  app = newApp;
};

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
    if (cause instanceof CLIError) return cause;
    if (cause instanceof arg.ArgError) return new ArgError(cause.message);
    return new UnexpectedError(cause);
  }

  async capture(): Promise<void> {
    if (this.isBug == IsBug.NO) return;

    Sentry.getCurrentHub().captureException(this, {
      event_id: this.sentryEventId,
      captureContext: {
        user: user ? { id: String(user.id), email: user.email, username: user.name ?? undefined } : undefined,
        tags: {
          applicationId: app ? app.id : undefined,
          arch: config.arch,
          isBug: this.isBug,
          code: this.code,
          environment: env.value,
          platform: config.platform,
          shell: config.shell,
          version: config.version,
        },
        contexts: {
          cause: this.cause ? serializeError(this.cause) : undefined,
          app: {
            command: `ggt ${process.argv.slice(2).join(" ")}`,
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
   * Turns this error into a user-friendly message that explains what went wrong and how to fix it. A good write up of
   * what an error should look like can be found here: {@link https://clig.dev/#errors}
   */
  render(): string {
    return compact([this.header(), this.body(), this.footer()]).join("\n\n");
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
 *
 * Wraps `serialize-error` with some handy stuff, like special support
 * for Got HTTP errors
 */
export function serializeError(error: unknown): ErrorObject {
  let serialized = baseSerializeError(isArray(error) ? new AggregateError(error) : error);
  if (typeof serialized == "string") {
    serialized = { message: serialized };
  }

  if (error instanceof RequestError) {
    serialized["timings"] = undefined;
    serialized["options"] = {
      method: error.options.method,
      url: error.options.url instanceof URL ? error.options.url.toJSON() : error.options.url,
    };
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

export class ClientError extends CLIError {
  isBug = IsBug.MAYBE;

  constructor(
    readonly payload: Payload<JsonObject, JsonObject>,
    override cause: string | Error | readonly GraphQLError[] | CloseEvent | ErrorEvent,
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

function isCloseEvent(e: unknown): e is SetOptional<CloseEvent, "target"> {
  return z.object({ type: z.string(), code: z.number(), reason: z.string(), wasClean: z.boolean() }).safeParse(e).success;
}

function isErrorEvent(e: unknown): e is SetOptional<ErrorEvent, "target"> {
  return z.object({ type: z.string(), message: z.string(), error: z.any() }).safeParse(e).success;
}

function isGraphQLErrors(e: unknown): e is readonly GraphQLError[] {
  return z.array(z.object({ message: z.string() })).safeParse(e).success;
}
