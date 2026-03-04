import type { Edit, EditSubscription } from "../app/edit/edit.js";
import { ENVIRONMENT_LOGS_SUBSCRIPTION } from "../app/edit/operation.js";
import type { Fields } from "../output/log/field.js";
import { Level } from "../output/log/level.js";
import { type LoggingArgsResult, createEnvironmentStructuredLogger } from "../output/log/structured.js";

type SubscribeMode = "follow" | "one-shot";

export type SubscribeToEnvironmentLogsOptions = {
  onError: (error: unknown) => void;
  mode?: SubscribeMode;
  start?: Date;
  limit?: number;
  onData?: () => void;
};

const includedLevels = (minimumLevel: number): string => {
  if (minimumLevel <= Level.DEBUG) {
    return "debug|info|warn|error";
  }
  if (minimumLevel === Level.INFO) {
    return "info|warn|error";
  }
  if (minimumLevel === Level.WARN) {
    return "warn|error";
  }
  return "error";
};

const buildQuery = (edit: Edit, args: LoggingArgsResult): string => {
  return `{environment_id="${edit.environment.id}"} | json | level=~"${includedLevels(args["--log-level"])}"${args["--my-logs"] ? ' | source="user"' : ""}`;
};

/**
 * Start a subscription to the environment's server-side logs and print them to the console.
 */
export const subscribeToEnvironmentLogs = (
  edit: Edit,
  args: LoggingArgsResult,
  { onError, mode = "follow", start, limit, onData }: SubscribeToEnvironmentLogsOptions,
): EditSubscription<ENVIRONMENT_LOGS_SUBSCRIPTION> => {
  const logger = createEnvironmentStructuredLogger(edit.environment);
  const query = buildQuery(edit, args);

  const variables =
    mode === "follow"
      ? () => ({ query, start: new Date(), ...(limit ? { limit } : {}) })
      : () => ({ query, start: start ?? new Date(Date.now() - 5 * 60 * 1000), ...(limit ? { limit } : {}) });

  return edit.subscribe({
    subscription: ENVIRONMENT_LOGS_SUBSCRIPTION,
    variables,
    onError,
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

      onData?.();
    },
  });
};
