import { ENVIRONMENT_LOGS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError } from "../services/command/arg.js";
import { defineCommand } from "../services/command/command.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { subscribeToEnvironmentLogs } from "../services/logs/subscribeToEnvironmentLogs.js";
import type { Fields } from "../services/output/log/field.js";
import { LoggingArgs, createEnvironmentStructuredLogger } from "../services/output/log/structured.js";
import { sprint } from "../services/output/sprint.js";

const VALID_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof VALID_LEVELS)[number];

const parseDate = (value: string): Date => {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ArgError(`Invalid date: "${value}". Use an ISO 8601 format like "2025-01-01T00:00:00Z".`);
  }
  return date;
};

const parseLevelArg = (value: string): LogLevel => {
  const lower = value.toLowerCase();

  switch (lower) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return lower;
    default:
      throw new ArgError(`Invalid level: "${value}". Must be one of: ${VALID_LEVELS.join(", ")}.`);
  }
};

const includedLevels = (minimumLevel: LogLevel): string => {
  const index = VALID_LEVELS.indexOf(minimumLevel);
  return VALID_LEVELS.slice(index).join("|");
};

export default defineCommand({
  name: "logs",
  aliases: ["log"],
  description: "Print recent logs or stream logs from your app",
  details: sprint`
    ${"ggt logs"} prints recent logs and exits by default. Use ${"--follow"} (${"-f"}) to stream logs continuously.
  `,
  examples: [
    "ggt logs",
    "ggt logs --start 2025-01-01T00:00:00Z --level warn",
    "ggt logs --follow --my-logs",
    "ggt logs --env production --json",
  ],
  args: {
    ...AppIdentityArgs,
    ...LoggingArgs,
    "--follow": { type: Boolean, alias: ["-f"], default: false },
    "--start": { type: parseDate },
    "--level": { type: parseLevelArg },
  },
  run: async (ctx, args) => {
    if (args._.length > 0) {
      throw new ArgError(
        sprint`
          "ggt logs" does not take any positional arguments.

          If you are trying to print logs for an app in a specific directory,
          you must "cd" to that directory and then run "ggt logs".
        `,
      );
    }

    const directory = await loadSyncJsonDirectory(process.cwd());
    const appIdentity = await AppIdentity.load(ctx, { command: "logs", args, directory });

    if (args["--follow"]) {
      const logsSubscription = subscribeToEnvironmentLogs(appIdentity.edit, args, {
        onError: (error) => {
          ctx.abort(error);
        },
      });

      ctx.onAbort((reason) => {
        ctx.log.info("stopping", { reason });
        logsSubscription.unsubscribe();
      });

      return;
    }

    const start = args["--start"] ?? new Date(Date.now() - 5 * 60 * 1000);
    const minimumLevel = args["--level"] ?? "info";

    const query = `{environment_id="${appIdentity.environment.id}"} | json | level=~"${includedLevels(minimumLevel)}"${args["--my-logs"] ? ' | source="user"' : ""}`;

    const logger = createEnvironmentStructuredLogger(appIdentity.environment);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let logsSubscription: { unsubscribe(): void } | undefined;

      const finish = (done: () => void): void => {
        if (settled) return;
        settled = true;
        logsSubscription?.unsubscribe();
        done();
      };

      logsSubscription = appIdentity.edit.subscribe({
        subscription: ENVIRONMENT_LOGS_SUBSCRIPTION,
        variables: { query, start, limit: 500 },
        onError: (error) => finish(() => reject(error)),
        onData: ({ logsSearchV2 }) => {
          for (const log of logsSearchV2.data["messages"] as [string, string][]) {
            const message: unknown = JSON.parse(log[1]);
            const { msg, name, level, ...fields } = message as Record<string, unknown>;

            logger(
              level as string,
              name as string,
              msg as Lowercase<string>,
              { ...fields } as Fields,
              new Date(Number(log[0]) / 1_000_000),
            );
          }

          finish(resolve);
        },
      });

      ctx.onAbort((reason) => {
        finish(() => {
          if (reason instanceof Error) reject(reason);
          else reject(new Error("Aborted"));
        });
      });
    });
  },
});
