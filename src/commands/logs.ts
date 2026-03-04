import { ENVIRONMENT_LOGS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError, type ArgsDefinition, type ArgsDefinitionResult } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
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

export type LogsArgs = typeof args;
export type LogsArgsResult = ArgsDefinitionResult<LogsArgs>;

export const args = {
  ...AppIdentityArgs,
  ...LoggingArgs,
  "--follow": { type: Boolean, alias: ["-f"], default: false },
  "--start": { type: parseDate },
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
  const minimumLevel = args["--level"] ?? "info";

  const query = `{environment_id="${appIdentity.environment.id}"} | json | level=~"${includedLevels(minimumLevel)}"${args["--my-logs"] ? ' | source="user"' : ""}`;

  const logger = createEnvironmentStructuredLogger(appIdentity.environment);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let logsSubscription: { unsubscribe(): void } | undefined;

    const finish = (done: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      logsSubscription?.unsubscribe();
      done();
    };

    logsSubscription = appIdentity.edit.subscribe({
      subscription: ENVIRONMENT_LOGS_SUBSCRIPTION,
      variables: { query, start, limit: 500 },
      onError: (error) => {
        finish(() => reject(error));
      },
      onData: ({ logsSearchV2 }) => {
        for (const log of logsSearchV2.data["messages"] as [string, string][]) {
          const message: unknown = JSON.parse(log[1]);
          const { msg, name, level, ...fields } = message as Record<string, unknown>;

          logger(
            level as string,
            name as string,
            msg as Lowercase<string>,
            {
              ...fields,
            } as Fields,
            new Date(Number(log[0]) / 1_000_000),
          );
        }

        finish(resolve);
      },
    });

    ctx.onAbort((reason) => {
      finish(() => {
        if (reason instanceof Error) {
          reject(reason);
        } else {
          reject(new Error("Aborted"));
        }
      });
    });
  });
};
