import ms from "ms";

import { AppIdentity, AppIdentityFlags } from "../services/command/app-identity.js";
import { defineCommand } from "../services/command/command.js";
import { FlagError } from "../services/command/flag.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { subscribeToEnvironmentLogs } from "../services/logs/subscribeToEnvironmentLogs.js";
import { LoggingFlags } from "../services/output/log/structured.js";
import { sprint } from "../services/output/sprint.js";

const ONE_SHOT_INITIAL_TIMEOUT_MS = ms("3s");
const ONE_SHOT_SILENCE_TIMEOUT_MS = 100;

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
  flags: {
    ...AppIdentityFlags,
    ...LoggingFlags,
    "--follow": {
      type: Boolean,
      alias: ["-f"],
      default: false,
      description: "Stream logs continuously",
      details: "When omitted, prints recent logs and exits.",
    },
    "--start": {
      type: (value: string): Date => {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new FlagError(`Invalid date: "${value}". Use an ISO 8601 format like "2025-01-01T00:00:00Z".`);
        }
        return date;
      },
      description: "Start time for one-shot log queries",
      valueName: "datetime",
      details: "ISO 8601 timestamp. Defaults to 5 minutes ago.",
    },
  },
  run: async (ctx, flags) => {
    if (flags._.length > 0) {
      throw new FlagError(
        sprint`
          "ggt logs" does not take any positional arguments.

          If you are trying to print logs for an app in a specific directory,
          you must "cd" to that directory and then run "ggt logs".
        `,
      );
    }

    const directory = await loadSyncJsonDirectory(process.cwd());
    const appIdentity = await AppIdentity.load(ctx, { command: "logs", flags, directory });

    if (flags["--follow"] && flags["--start"]) {
      throw new FlagError("--start cannot be used with --follow. --start is only for one-shot log queries.");
    }

    if (flags["--follow"]) {
      const logsSubscription = subscribeToEnvironmentLogs(appIdentity.edit, flags, {
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

    const start = flags["--start"] ?? new Date(Date.now() - ms("5m"));
    const queryTime = Date.now();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let logsSubscription: { unsubscribe(): void } | undefined;
      let noDataTimeout: ReturnType<typeof setTimeout> | undefined;

      const resetTimeout = (): void => {
        if (noDataTimeout) clearTimeout(noDataTimeout);
        noDataTimeout = setTimeout(() => finish(resolve), ONE_SHOT_SILENCE_TIMEOUT_MS);
      };

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

      logsSubscription = subscribeToEnvironmentLogs(appIdentity.edit, flags, {
        mode: "one-shot",
        start,
        limit: 500,
        onError: (error) => finish(() => reject(error)),
        onBatch: (latestTimestampMs) => {
          if (latestTimestampMs >= queryTime) {
            // We've caught up to live — historical data is complete
            finish(resolve);
          } else {
            // More historical data may follow, reset with short silence timeout
            resetTimeout();
          }
        },
      });

      // Initial timeout is longer to allow for WebSocket connection setup
      noDataTimeout = setTimeout(() => finish(resolve), ONE_SHOT_INITIAL_TIMEOUT_MS);

      ctx.onAbort((reason) => {
        finish(() => {
          if (reason instanceof Error) reject(reason);
          else reject(new Error("Aborted"));
        });
      });
    });
  },
});
