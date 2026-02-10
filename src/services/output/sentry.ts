import type * as SentryModule from "@sentry/node";

import ms from "ms";
import os from "node:os";

import type { RootArgsResult } from "../../commands/root.js";
import type { Context } from "../command/context.js";
import type { FieldPrimitive } from "./log/field.js";
import type { GGTError } from "./report.js";

import { config } from "../config/config.js";
import { env } from "../config/env.js";
import { serializeError } from "../util/object.js";
import { packageJson } from "../util/package-json.js";

let Sentry: typeof SentryModule | undefined;

export const initSentry = async (_ctx: Context, args: RootArgsResult): Promise<void> => {
  if (!args["--telemetry"]) {
    return;
  }

  Sentry = await import("@sentry/node");

  Sentry.init({
    dsn: "https://0c26e0d8afd94e77a88ee1c3aa9e7065@o250689.ingest.sentry.io/6703266",
    enabled: env.productionLike && (args["--telemetry"] ?? false),
    release: packageJson.version,
    environment: packageJson.version.includes("experimental") ? "experimental" : "production",
  });
};

export const sendErrorToSentry = async (error: GGTError): Promise<void> => {
  if (!Sentry) {
    return;
  }

  Sentry.captureException(error, {
    event_id: error.id,
    captureContext: {
      tags: {
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
};

export const addSentryBreadcrumb = (breadcrumb: SentryModule.Breadcrumb): void => {
  if (!Sentry) {
    return;
  }

  Sentry.addBreadcrumb(breadcrumb);
};

export const setSentryUser = (user: SentryModule.User): void => {
  if (!Sentry) {
    return;
  }

  Sentry.setUser(user);
};

export const setSentryTags = (tags: Record<string, FieldPrimitive>): void => {
  if (!Sentry) {
    return;
  }

  Sentry.setTags(tags);
};
