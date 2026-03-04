import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError } from "../services/command/arg.js";
import { defineCommand } from "../services/command/command.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { subscribeToEnvironmentLogs } from "../services/logs/subscribeToEnvironmentLogs.js";
import { LoggingArgs } from "../services/output/log/structured.js";
import { sprint } from "../services/output/sprint.js";

const parseDate = (value: string): Date => {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ArgError(`Invalid date: "${value}". Use an ISO 8601 format like "2025-01-01T00:00:00Z".`);
  }
  return date;
};

const ONE_SHOT_WAIT_FOR_DATA_TIMEOUT_MS = 3_000;

export default defineCommand({
  name: "logs",
  aliases: ["log"],
  description: "Print recent logs or stream logs from your app",
  details: sprint`
    Prints recent logs and exits by default. Use ${"--follow"} (${"-f"}) to stream logs continuously.
  `,
  examples: [
    "ggt logs",
    "ggt logs --start 2025-01-01T00:00:00Z --log-level warn",
    "ggt logs --follow --my-logs",
    "ggt logs --env production --json",
  ],
  args: {
    ...AppIdentityArgs,
    ...LoggingArgs,
    "--follow": {
      type: Boolean,
      alias: ["-f"],
      default: false,
      description: "Stream logs continuously",
      details: "When omitted, prints recent logs and exits.",
    },
    "--start": {
      type: parseDate,
      description: "Start time for one-shot log queries",
      valueName: "datetime",
      details: "ISO 8601 timestamp. Defaults to 5 minutes ago.",
    },
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

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let logsSubscription: { unsubscribe(): void } | undefined;
      let noDataTimeout: ReturnType<typeof setTimeout> | undefined;

      const finish = (done: () => void): void => {
        if (settled) return;
        settled = true;
        if (noDataTimeout) {
          clearTimeout(noDataTimeout);
          noDataTimeout = undefined;
        }
        logsSubscription?.unsubscribe();
        done();
      };

      logsSubscription = subscribeToEnvironmentLogs(appIdentity.edit, args, {
        mode: "one-shot",
        start,
        limit: 500,
        onError: (error) => finish(() => reject(error)),
        onData: () => finish(resolve),
      });

      noDataTimeout = setTimeout(() => finish(resolve), ONE_SHOT_WAIT_FOR_DATA_TIMEOUT_MS);

      ctx.onAbort((reason) => {
        finish(() => {
          if (reason instanceof Error) reject(reason);
          else reject(new Error("Aborted"));
        });
      });
    });
  },
});
