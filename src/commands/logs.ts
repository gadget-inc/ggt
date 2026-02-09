import { ArgError, type ArgsDefinition, type ArgsDefinitionResult } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { LoggingArgs } from "../services/output/log/structured.js";
import { sprint } from "../services/output/sprint.js";

// Maps level names to the backend's UserspaceLogLevel integer values
const BACKEND_LEVEL: Record<string, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

const VALID_LEVELS: readonly string[] = Object.keys(BACKEND_LEVEL);
const VALID_DIRECTIONS: readonly string[] = ["forward", "backward"];

const parseDate = (value: string): Date => {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ArgError(`Invalid date: "${value}". Use an ISO 8601 format like "2025-01-01T00:00:00Z".`);
  }
  return date;
};

const parseDirection = (value: string): string => {
  if (!VALID_DIRECTIONS.includes(value)) {
    throw new ArgError(`Invalid direction: "${value}". Must be "forward" or "backward".`);
  }
  return value;
};

const parseLevelArg = (value: string): number => {
  const lower = value.toLowerCase();
  const level = BACKEND_LEVEL[lower];
  if (level === undefined) {
    throw new ArgError(`Invalid level: "${value}". Must be one of: ${VALID_LEVELS.join(", ")}.`);
  }
  return level;
};

export type LogsArgs = typeof args;
export type LogsArgsResult = ArgsDefinitionResult<LogsArgs>;

export const args = {
  ...SyncJsonArgs,
  ...LoggingArgs,
  "--tail": { type: Boolean, alias: ["-t"], default: false },
  "--start": { type: parseDate },
  "--end": { type: parseDate },
  "--direction": { type: parseDirection },
  "--level": { type: parseLevelArg },
} satisfies ArgsDefinition;

export const usage: Usage = (_ctx) => {
  return sprint`
  Prints recent logs for an application. Use --tail to stream logs continuously.

  {gray Usage}
        ggt logs [options]

  {gray Options}
        -t, --tail                     Stream logs continuously instead of printing recent logs and exiting
        --start <datetime>             Start time for log query (default: 5 minutes ago). ISO 8601 format
        --end <datetime>               End time for log query. ISO 8601 format
        --direction <direction>        Log ordering: "forward" or "backward"
        --level <level>                Minimum log level: debug, info, warn, error
        -ll, --log-level <level>       Sets the log level for incoming application logs in --tail mode (default: info)
        --my-logs                      Only outputs user sourced logs and exclude logs from the Gadget framework
        --json                         Output logs in JSON format
        -a, --app <app_name>           Selects the app to pull your environment changes from. Default set on ".gadget/sync.json"
        -e, --env, --from <env_name>   Selects the environment to pull changes from. Default set on ".gadget/sync.json"

  {gray Examples}
        Print recent logs from your development environment
        {cyanBright $ ggt logs --env development}

        Print logs from the last hour
        {cyanBright $ ggt logs --start "$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)"}

        Print only error logs
        {cyanBright $ ggt logs --level error}

        Stream all user logs from your development environment
        {cyanBright $ ggt logs --tail --env development --my-logs}

        Print recent logs from your production environment in JSON format
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

  if (args["--tail"]) {
    const logsSubscription = filesync.subscribeToEnvironmentLogs(args, {
      onError: (error) => {
        ctx.abort(error);
      },
    });

    ctx.onAbort((reason) => {
      ctx.log.info("stopping", { reason });
      logsSubscription.unsubscribe();
    });
  } else {
    const start = args["--start"] ?? new Date(Date.now() - 5 * 60 * 1000);
    const end = args["--end"];
    const direction = args["--direction"];
    const level = args["--level"];

    if (end && end.getTime() < start.getTime()) {
      throw new ArgError("--end cannot be before --start.");
    }

    await filesync.queryEnvironmentLogs(args, {
      start: start.toISOString(),
      ...(end ? { end: end.toISOString() } : {}),
      ...(direction ? { direction } : {}),
      ...(level ? { level } : {}),
    });
  }
};
