import type { Edit, EditSubscription } from "../app/edit/edit.js";
import type { Fields } from "../output/log/field.js";

import { ENVIRONMENT_LOGS_SUBSCRIPTION } from "../app/edit/operation.js";
import { Level } from "../output/log/level.js";
import { type LoggingArgsResult, createEnvironmentStructuredLogger } from "../output/log/structured.js";

/**
 * Start a subscription to the environment's server side logs and print them to the console.
 */
export const subscribeToEnvironmentLogs = (
  edit: Edit,
  args: LoggingArgsResult,
  {
    onError,
  }: {
    onError: (error: unknown) => void;
  },
): EditSubscription<ENVIRONMENT_LOGS_SUBSCRIPTION> => {
  const logger = createEnvironmentStructuredLogger(edit.environment);

  const includedLevels = Object.entries(Level)
    .filter(([_, value]) => {
      return value >= args["--log-level"];
    })
    .map(([key]) => key.toLowerCase())
    .join("|");

  return edit.subscribe({
    subscription: ENVIRONMENT_LOGS_SUBSCRIPTION,
    variables: () => ({
      query: `{environment_id="${edit.environment.id}"} | json | level=~"${includedLevels}"${args["--my-logs"] ? ' | source="user"' : ""}`,
      start: new Date(),
    }),
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
    },
  });
};
