import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError } from "../services/command/arg.js";
import { defineCommand } from "../services/command/command.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { subscribeToEnvironmentLogs } from "../services/logs/subscribeToEnvironmentLogs.js";
import colors from "../services/output/colors.js";
import { LoggingArgs } from "../services/output/log/structured.js";
import { sprint } from "../services/output/sprint.js";

export default defineCommand({
  name: "logs",
  aliases: ["log"],
  description: "Stream logs from your app in real time",
  details: sprint`
    Streams HTTP requests, background action invocations, and console output from your
    environment. Use ${colors.hint("--my-logs")} to show only logs emitted by your code.
    Use ${colors.hint("--log-level")} to set the minimum severity (e.g. warn or error).
  `,
  examples: ["ggt logs", "ggt logs --env production", "ggt logs --my-logs --log-level warn", "ggt logs --json"],
  args: {
    ...AppIdentityArgs,
    ...LoggingArgs,
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

    const logsSubscription = subscribeToEnvironmentLogs(appIdentity.edit, args, {
      onError: (error) => {
        ctx.abort(error);
      },
    });

    ctx.onAbort((reason) => {
      ctx.log.info("stopping", { reason });
      logsSubscription.unsubscribe();
    });
  },
});
