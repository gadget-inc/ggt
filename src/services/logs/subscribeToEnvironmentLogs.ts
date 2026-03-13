import ms from "ms";

import type { Edit, EditSubscription } from "../app/edit/edit.ts";
import { ENVIRONMENT_LOGS_SUBSCRIPTION } from "../app/edit/operation.ts";
import type { Fields } from "../output/log/field.ts";
import { Level } from "../output/log/level.ts";
import { type LoggingFlagsResult, createEnvironmentStructuredLogger } from "../output/log/structured.ts";

type SubscribeMode = "follow" | "one-shot";

export type SubscribeToEnvironmentLogsOptions = {
  onError: (error: unknown) => void;
  mode?: SubscribeMode;
  start?: Date;
  limit?: number;
  /** Called after each batch with the latest log timestamp in ms. */
  onBatch?: (latestTimestampMs: number) => void;
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

const buildQuery = (edit: Edit, flags: LoggingFlagsResult): string => {
  return `{environment_id="${edit.environment.id}"} | json | level=~"${includedLevels(flags["--log-level"])}"${flags["--my-logs"] ? ' | source="user"' : ""}`;
};

/**
 * Start a subscription to the environment's server-side logs and print them to the console.
 */
export const subscribeToEnvironmentLogs = (
  edit: Edit,
  flags: LoggingFlagsResult,
  { onError, mode = "follow", start, limit, onBatch }: SubscribeToEnvironmentLogsOptions,
): EditSubscription<ENVIRONMENT_LOGS_SUBSCRIPTION> => {
  const logger = createEnvironmentStructuredLogger(edit.environment);
  const query = buildQuery(edit, flags);

  const variables =
    mode === "follow"
      ? () => ({ query, start: new Date(), ...(limit ? { limit } : {}) })
      : () => ({ query, start: start ?? new Date(Date.now() - ms("5m")), ...(limit ? { limit } : {}) });

  return edit.subscribe({
    subscription: ENVIRONMENT_LOGS_SUBSCRIPTION,
    variables,
    onError,
    onData: ({ logsSearchV2 }) => {
      let latestTimestampMs = 0;

      for (const log of logsSearchV2.data["messages"] as [string, string][]) {
        const timestampMs = Number(log[0]) / 1_000_000;
        if (timestampMs > latestTimestampMs) {
          latestTimestampMs = timestampMs;
        }

        const message: unknown = JSON.parse(log[1]);
        const { msg, name, level, ...fields } = message as Record<string, unknown>;

        logger(
          level as string,
          name as string,
          msg as Lowercase<string>,
          {
            ...fields,
          } as Fields,
          new Date(timestampMs),
        );
      }

      onBatch?.(latestTimestampMs);
    },
  });
};
