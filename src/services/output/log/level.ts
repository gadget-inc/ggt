import assert from "node:assert";
import { z } from "zod";

import { MemoAllArgs, memo } from "../../util/function.js";
import { clamp } from "../../util/number.js";

export type Level = (typeof Level)[keyof typeof Level];

export const Level = {
  TRACE: 1,
  DEBUG: 2,
  INFO: 3,
  WARN: 4,
  ERROR: 5,
  PRINT: 6,
} as const;

export const parseLevel = memo(MemoAllArgs, (value: unknown, defaultValue: Level): Level => {
  let parsed = z
    .enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR"])
    .transform((str) => Level[str])
    .safeParse(String(value).toUpperCase());

  if (!parsed.success) {
    parsed = z.number().min(Level.TRACE).max(Level.ERROR).safeParse(Number(value)) as typeof parsed;
  }

  return parsed.success ? parsed.data : defaultValue;
});

/**
 * Converts a numeric verbosity value to a log level.
 *
 * @param verbosity - The verbosity value
 * @returns The log level
 * @example
 * verbosityToLevel(1) // => Level.INFO
 * verbosityToLevel(2) // => Level.DEBUG
 * verbosityToLevel(3) // => Level.TRACE
 * verbosityToLevel(Infinity) // => Level.TRACE
 */
export const verbosityToLevel = (verbosity: number): Level => {
  assert(verbosity > 0, "verbosity must be greater than 0");
  return clamp(Level.INFO + 1 - verbosity, Level.TRACE, Level.INFO) as Level;
};
