import levenshtein from "fast-levenshtein";
import assert from "node:assert";

/**
 * Returns a new array with all falsy values removed. The values
 * `false`, `null`, `0`, `""`, `undefined`, and `NaN` are falsy.
 *
 * @param array - The array to compact.
 * @returns A new array with all falsy values removed.
 */
export const compact = <T>(array: T[]): NonNullable<T>[] => {
  return array.filter((value): value is NonNullable<T> => Boolean(value));
};

/**
 * Returns a new array with all duplicate elements removed.
 *
 * @param array The array to remove duplicates from.
 * @returns A new array with all duplicate elements removed.
 */
export const uniq = <T>(array: T[]): T[] => {
  return [...new Set(array)];
};

/**
 * Sorts an array of strings based on their similarity to a given input
 * string. The closest match is returned as the first element, followed
 * by the sorted array.
 *
 * @param input - The input string to compare against.
 * @param options - The array of strings to be sorted.
 * @returns An array with the closest match as the first element,
 * followed by the sorted array.
 */
export const sortBySimilar = (input: string, options: readonly string[]): [closest: string, ...sorted: string[]] => {
  assert(options.length > 0, "options must not be empty");
  return [...options].sort((a, b) => levenshtein.get(a, input) - levenshtein.get(b, input)) as [string, ...string[]];
};
