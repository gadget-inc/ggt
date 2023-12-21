/**
 * Parses a string value into a number. If the value is an invalid
 * number it returns {@linkcode defaultValue}.
 *
 * @param value - The string value to parse.
 * @returns The parsed number.
 */
export const parseNumber = (value: string | null | undefined, defaultValue = 0): number => {
  value ??= "";
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Ensures that a number is within a given range.
 *
 * If the number is less than the minimum value, the minimum value is returned.
 * If the number is greater than the maximum value, the maximum value is returned.
 * Otherwise, the number is returned as is.
 *
 * @param value - The value to be clamped.
 * @param min - The minimum value of the range.
 * @param max - The maximum value of the range.
 * @returns The clamped value.
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};
