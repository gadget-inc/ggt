import cleanStack from "clean-stack";
import { randomUUID } from "node:crypto";
import terminalLink from "terminal-link";
import type { Context } from "../command/context.js";
import { env } from "../config/env.js";
import { isAbortError } from "../util/is.js";
import { serializeError } from "../util/object.js";
import { workspaceRoot } from "../util/paths.js";
import { println } from "./print.js";
import { initSentry, sendErrorToSentry } from "./sentry.js";
import { sprint, sprintln, type SprintOptions } from "./sprint.js";

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

    await sendErrorToSentry(ctx, error);
  } finally {
    process.exit(1);
  }
};

export const installErrorHandlers = async (ctx: Context): Promise<void> => {
  ctx.log.debug("installing error handlers");
  await initSentry(ctx);

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
    let content = this.render();

    if (this.isBug !== IsBug.NO) {
      // ensure the rendered message ends with a newline
      content = sprintln(content);

      const thisIsABug = this.isBug === IsBug.YES ? "This is a bug" : "If you think this is a bug";
      const issueLink = `https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=${this.id}`;

      if (terminalLink.isSupported) {
        content += sprintln({
          ensureEmptyLineAbove: true,
          content: sprint`
            ${thisIsABug}, ${terminalLink("click here", issueLink)} to create an issue on GitHub.
          `,
        });
      } else {
        content += sprintln({
          ensureEmptyLineAbove: true,
          content: sprint`
            ${thisIsABug}, use the link below to create an issue on GitHub.

            ${issueLink}
          `,
        });
      }
    }

    return content;
  }

  print(options?: SprintOptions): void {
    println({ ensureEmptyLineAbove: true, ...options, content: this.sprint() });
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
