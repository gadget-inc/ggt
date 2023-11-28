import { memo } from "./function.js";

/**
 * Parses a string value and returns a boolean value.
 *
 * @param value - The string value to parse.
 * @returns A boolean value representing the parsed value.
 */
export const parseBoolean = memo((value: string | null | undefined): boolean => {
  value ??= "";
  return ["true", "1"].includes(value.trim().toLowerCase());
});
