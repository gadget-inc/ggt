import { LOGS_SEARCH_V3_QUERY } from "../services/app/edit/operation.js";
import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError, type ArgsDefinition, type ArgsDefinitionResult } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { subscribeToEnvironmentLogs } from "../services/logs/subscribeToEnvironmentLogs.js";
import type { Fields } from "../services/output/log/field.js";
import { LoggingArgs, createEnvironmentStructuredLogger } from "../services/output/log/structured.js";
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

  switch (lower) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return BACKEND_LEVEL[lower];
    default:
      throw new ArgError(`Invalid level: "${value}". Must be one of: ${VALID_LEVELS.join(", ")}.`);
  }
};

export type LogsArgs = typeof args;
export type LogsArgsResult = ArgsDefinitionResult<LogsArgs>;

export const args = {
  ...AppIdentityArgs,
  ...LoggingArgs,
  "--follow": { type: Boolean, alias: ["-f"], default: false },
  "--start": { type: parseDate },
  "--end": { type: parseDate },
  "--direction": { type: parseDirection },
  "--level": { type: parseLevelArg },
} satisfies ArgsDefinition;

export const usage: Usage = (_ctx) => {
  return sprint`
  Prints recent logs for an application. Use --follow to stream logs continuously.

  {gray Usage}
        ggt logs [options]

  {gray Options}
        -f, --follow                   Stream logs continuously instead of printing recent logs and exiting
        --start <datetime>             Start time for log query (default: 5 minutes ago). ISO 8601 format
        --end <datetime>               End time for log query. ISO 8601 format
        --direction <direction>        Log ordering: "forward" or "backward"
        --level <level>                Minimum log level: debug, info, warn, error
        -ll, --log-level <level>       Sets the log level for incoming application logs in --follow mode (default: info)
        --my-logs                      Only outputs user sourced logs and exclude logs from the Gadget framework
        --json                         Output logs in JSON format
        -a, --app <app_name>           Selects the app to pull your environment changes from. Defaults to the app synced to the current directory, if there is one.
        -e, --env, --from <env_name>   Selects the environment to pull changes from. Defaults to the environment synced to the current directory, if there is one.

  {gray Examples}
        Print recent logs from your development environment
        {cyanBright $ ggt logs --env development}

        Print logs from the last hour
        {cyanBright $ ggt logs --start "$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)"}

        Print only error logs
        {cyanBright $ ggt logs --level error}

        Stream all user logs from your development environment
        {cyanBright $ ggt logs --follow --env development --my-logs}

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
  const appIdentity = await AppIdentity.load(ctx, { command: "pull", args, directory });

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
  const end = args["--end"];
  const direction = args["--direction"];
  const level = args["--level"];

  if (end && end.getTime() < start.getTime()) {
    throw new ArgError("--end cannot be before --start.");
  }

  const query = args["--my-logs"] ? 'source:"user"' : "";

  const result = await appIdentity.edit.query({
    query: LOGS_SEARCH_V3_QUERY,
    variables: {
      query,
      start: start.toISOString(),
      ...(end ? { end: end.toISOString() } : {}),
      ...(direction ? { direction } : {}),
      ...(level ? { level } : {}),
    },
  });

  if (result.logsSearchV3.__typename === "LogSearchErrorResult") {
    throw new Error(`Logs search failed: ${JSON.stringify(result.logsSearchV3.error)}`);
  }

  const logger = createEnvironmentStructuredLogger(appIdentity.environment);
  for (const row of result.logsSearchV3.data ?? []) {
    const fields: Record<string, unknown> = {};
    if (row.labels) {
      Object.assign(fields, row.labels);
    }

    logger(
      row.level,
      row.name,
      (row.message ?? "") as Lowercase<string>,
      fields as Fields,
      new Date(Number(row.timestampNanos) / 1_000_000),
    );
  }
};
