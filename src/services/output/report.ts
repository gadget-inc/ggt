import * as Sentry from "@sentry/node";
import cleanStack from "clean-stack";
import ms from "ms";
import { randomUUID } from "node:crypto";
import os from "node:os";
import terminalLink from "terminal-link";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { env } from "../config/env.js";
import { packageJson } from "../config/package-json.js";
import { isAbortError } from "../util/is.js";
import { serializeError } from "../util/object.js";
import { workspaceRoot } from "../util/paths.js";
import { println } from "./print.js";
import { sprintln, type SprintOptions } from "./sprint.js";

export const reportErrorAndExit = async (ctx: Context, cause: unknown): Promise<never> => {
  if (isAbortError(cause)) {
    ctx.log.debug("aborting without reporting error", { error: cause });
    return process.exit(1);
  }

  ctx.log.error("reporting error and exiting", { error: cause });

  try {
    const error = GGTError.from(cause);
    error.print();

    if (error.isBug === IsBug.NO) {
      return undefined as never;
    }

    Sentry.captureException(error, {
      event_id: error.id,
      captureContext: {
        user: ctx.user && {
          id: String(ctx.user.id),
          email: ctx.user.email,
          username: ctx.user.name ?? undefined,
        },
        tags: {
          application_id: ctx.app?.id,
          arch: config.arch,
          bug: error.isBug,
          environment: env.value,
          platform: config.platform,
          shell: config.shell,
          version: packageJson.version,
        },
        contexts: {
          ctx: {
            argv: process.argv,
            args: ctx.args,
          },
          cause: error.cause ? serializeError(error.cause) : undefined,
          app: {
            app_name: packageJson.name,
            app_version: packageJson.version,
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

    await Sentry.flush(ms("2s"));
  } finally {
    process.exit(1);
  }
};

export const installErrorHandlers = (ctx: Context): void => {
  ctx.log.debug("installing error handlers");

  Sentry.init({
    dsn: "https://0c26e0d8afd94e77a88ee1c3aa9e7065@o250689.ingest.sentry.io/6703266",
    enabled: env.productionLike && ctx.args["--telemetry"],
    release: packageJson.version,
    environment: packageJson.version.includes("experimental") ? "experimental" : "production",
  });

  const handleError = (error: unknown) => void reportErrorAndExit(ctx, error);
  process.once("uncaughtException", handleError);
  process.once("unhandledRejection", handleError);
};

export const IsBug = Object.freeze({
  YES: "yes",
  NO: "no",
  MAYBE: "maybe",
});

export type IsBug = (typeof IsBug)[keyof typeof IsBug];

/**
 * Base class for all errors.
 */
export abstract class GGTError extends Error {
  /**
   * The ID for this error.
   */
  id = env.testLike ? "00000000-0000-0000-0000-000000000000" : randomUUID();

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

  constructor(message: string) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.stack = cleanStack(this.stack, { pretty: true, basePath: workspaceRoot });
  }

  /**
   * Constructs a GGTError from an unknown cause.
   *
   * @param cause - The cause of the error.
   */
  static from(cause: unknown): GGTError {
    if (cause instanceof GGTError) {
      return cause;
    }
    return new UnexpectedError(cause);
  }

  sprint(): string {
    let rendered = this.render();

    if (this.isBug !== IsBug.NO) {
      // ensure the rendered message ends with a newline
      rendered = sprintln(rendered);

      const thisIsABug = this.isBug === IsBug.YES ? "This is a bug" : "If you think this is a bug";
      const issueLink = `https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=${this.id}`;

      if (terminalLink.isSupported) {
        rendered += sprintln({ ensureEmptyLineAbove: true })`
          ${thisIsABug}, ${terminalLink("click here", issueLink)} to create an issue on GitHub.
        `;
      } else {
        rendered += sprintln({ ensureEmptyLineAbove: true })`
          ${thisIsABug}, use the link below to create an issue on GitHub.

          ${issueLink}
        `;
      }
    }

    return rendered;
  }

  print(options?: SprintOptions): void {
    println({ ensureEmptyLineAbove: true, ...options })(this.sprint());
  }

  /**
   * Turns this error into a user-friendly message that explains what
   * went wrong and how to fix it. A good write up of what an error
   * should look like can be found here:
   * {@link https://clig.dev/#errors}
   */
  protected abstract render(): string;
}

/**
 * Our "catch all" error.
 *
 * If this error is thrown, we almost certainly have a bug, and should
 * either fix it or add a more specific error so that we can provide
 * more useful information.
 */
export class UnexpectedError extends GGTError {
  isBug = IsBug.YES;

  constructor(override cause: unknown) {
    super("An unexpected error occurred");
  }

  protected render(): string {
    const serialized = serializeError(this.cause);
    const body = serialized.stack || serialized.message || this.stack;
    return this.message + ".\n\n" + body;
  }
}

/**
 * An error that is expected to happen sometimes.
 */
export class EdgeCaseError extends GGTError {
  isBug = IsBug.MAYBE;

  constructor(
    message: string,
    override cause?: unknown,
  ) {
    super(message);
  }

  protected render(): string {
    return this.message;
  }
}
