import type { Run } from "../services/command/command.js";

import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError, type ArgsDefinition, type ArgsDefinitionResult } from "../services/command/arg.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { subscribeToEnvironmentLogs } from "../services/logs/subscribeToEnvironmentLogs.js";
import { LoggingArgs } from "../services/output/log/structured.js";
import { sprint } from "../services/output/sprint.js";

export const description = "Stream your environment's logs";

export const examples = ["ggt logs --env development --my-logs", "ggt logs --env production --json"] as const;

export type LogsArgs = typeof args;
export type LogsArgsResult = ArgsDefinitionResult<LogsArgs>;

export const args = {
  ...AppIdentityArgs,
  ...LoggingArgs,
} satisfies ArgsDefinition;

export const run: Run<LogsArgs> = async (ctx, args) => {
  if (args._.length > 0) {
    throw new ArgError(sprint`
      "ggt logs" does not take any positional arguments.

      If you are trying to print logs for an app in specific directory,
      you must "cd" to that directory and then run "ggt logs".

      Run "ggt logs -h" for more information.
    `);
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
};
