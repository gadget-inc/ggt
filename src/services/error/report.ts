import * as Sentry from "@sentry/node";
import ms from "ms";
import os from "node:os";
import { serializeError } from "serialize-error";
import type { App } from "../app/app.js";
import { config } from "../config/config.js";
import { env } from "../config/env.js";
import { createLogger } from "../output/log/logger.js";
import type { User } from "../user/user.js";
import { parseBoolean } from "../util/boolean.js";
import { CLIError, IsBug } from "./error.js";

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
    log.println(error.render());

    if (error.isBug !== IsBug.NO) {
      Sentry.getCurrentHub().captureException(error, {
        event_id: error.sentryEventId,
        captureContext: {
          user: user ? { id: String(user.id), email: user.email, username: user.name ?? undefined } : undefined,
          tags: {
            applicationId: app ? app.id : undefined,
            arch: config.arch,
            bug: error.isBug,
            code: error.code,
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
