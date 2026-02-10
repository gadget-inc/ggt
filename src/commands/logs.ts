import type { Run, Usage } from "../services/command/command.js";

import { ArgError, type ArgsDefinition, type ArgsDefinitionResult } from "../services/command/arg.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { LoggingArgs } from "../services/output/log/structured.js";
import { sprint } from "../services/output/sprint.js";

export type LogsArgs = typeof args;
export type LogsArgsResult = ArgsDefinitionResult<LogsArgs>;

export const args = {
  ...SyncJsonArgs,
  ...LoggingArgs,
} satisfies ArgsDefinition;

export const usage: Usage = (_ctx) => {
  return sprint`
  Streams the logs for an application to.

  {gray Usage}
        ggt logs [options]

  {gray Options}
        -ll, --log-level <level>       Sets the log level for incoming application logs (default: info)
        --my-logs                      Only outputs user sourced logs and exclude logs from the Gadget framework
        --json                         Output logs in JSON format
        -a, --app <app_name>           Selects the app to pull your environment changes from. Default set on ".gadget/sync.json"
        -e, --env, --from <env_name>   Selects the environment to pull changes from. Default set on ".gadget/sync.json"

  {gray Examples}
        Stream all user logs from your development environment
        {cyanBright $ ggt logs --env development --my-logs}

        Stream all logs from your production environment in JSON format
        {cyanBright $ ggt logs --env production --json}
  `;
};

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
  const syncJson = await SyncJson.loadOrInit(ctx, { command: "pull", args, directory });
  const filesync = new FileSync(syncJson);

  const logsSubscription = filesync.subscribeToEnvironmentLogs(args, {
    onError: (error) => {
      ctx.abort(error);
    },
  });

  ctx.onAbort((reason) => {
    ctx.log.info("stopping", { reason });
    logsSubscription.unsubscribe();
  });
};
