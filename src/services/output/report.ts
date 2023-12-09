import * as Sentry from "@sentry/node";
import cleanStack from "clean-stack";
import ms from "ms";
import { randomUUID } from "node:crypto";
import os from "node:os";
import type { App } from "../app/app.js";
import { config } from "../config/config.js";
import { env } from "../config/env.js";
import type { User } from "../user/user.js";
import { parseBoolean } from "../util/boolean.js";
import { serializeError } from "../util/object.js";
import { workspaceRoot } from "../util/paths.js";
import { createLogger } from "./log/logger.js";
import { sprint } from "./sprint.js";

const log = createLogger({ name: "report" });

let user: User | undefined;
export const setUser = (newUser: typeof user): void => {
  log.trace("set user", { user: newUser });
  user = newUser;
  // eslint-disable-next-line unicorn/no-null
  Sentry.setUser(newUser ?? null);
};

let app: App | undefined;
export const setApp = (newApp: typeof app): void => {
  log.trace("set app", { app: newApp });
  app = newApp;
};

export const reportErrorAndExit = async (cause: unknown): Promise<never> => {
  log.error("reporting error and exiting", { error: cause });

  try {
    const error = CLIError.from(cause);
    log.println(error.toString());

    if (error.isBug !== IsBug.NO) {
      Sentry.getCurrentHub().captureException(error, {
        event_id: error.id,
        captureContext: {
          user: user ? { id: String(user.id), email: user.email, username: user.name ?? undefined } : undefined,
          tags: {
            applicationId: app ? app.id : undefined,
            arch: config.arch,
            bug: error.isBug,
            environment: env.value,
            platform: config.platform,
            shell: config.shell,
            version: config.version,
          },
          contexts: {
            cause: error.cause ? serializeError(error.cause) : undefined,
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

      await Sentry.flush(ms("2s"));
    }
  } finally {
    process.exit(1);
  }
};

export const installErrorHandlers = (): void => {
  log.debug("installing error handlers");

  Sentry.init({
    dsn: "https://0c26e0d8afd94e77a88ee1c3aa9e7065@o250689.ingest.sentry.io/6703266",
    release: config.version,
    enabled: env.productionLike && parseBoolean(process.env["GGT_SENTRY_ENABLED"] ?? "true"),
  });

  process.once("uncaughtException", (error) => {
    void reportErrorAndExit(error);
  });

  process.once("unhandledRejection", (error) => {
    void reportErrorAndExit(error);
  });
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
export abstract class CLIError extends Error {
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
   * Constructs a CLIError from a cause.
   */
  static from(cause: unknown): CLIError {
    if (cause instanceof CLIError) {
      return cause;
    }
    return new UnexpectedError(cause);
  }

  override toString(): string {
    let rendered = this.render();

    if (this.isBug !== IsBug.NO) {
      rendered +=
        "\n\n" +
        sprint`
          ${this.isBug === IsBug.YES ? "This is a bug" : "If you think this is a bug"}, please submit an issue using the link below.

          https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=${this.id}
        `;
    }

    return rendered;
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
export class UnexpectedError extends CLIError {
  isBug = IsBug.YES;

  constructor(override cause: unknown) {
    super("An unexpected error occurred");
  }

  protected render(): string {
    const serialized = serializeError(this.cause);
    const body = serialized.stack || serialized.message || this.stack;
    return this.message + "\n\n" + body;
  }
}
