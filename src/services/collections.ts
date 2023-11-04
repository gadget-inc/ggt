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
 * Same as Array.prototype.map but works for Map and Set which don't have that method.
 *
 * @param list The iterable to map over.
 * @param fn The function to apply to each element in the iterable.
 * @returns An array of the results of applying the function to each element in the iterable.
 */
export const map = <T, U>(list: Iterable<T>, fn: (value: T) => U): U[] => {
  const mapped = [];
  for (const value of list) {
    mapped.push(fn(value));
  }
  return mapped;
};

/**
 * Maps an iterable of objects to an array of values for a given key.
 *
 * @param list The iterable of objects to map.
 * @param key The key to extract values for.
 * @param take The maximum number of objects to map.
 * @returns An array of values for the given key.
 * @example mapValues([{ id: 1 }, { id: 2 }, { id: 3 }], 'id') // [1, 2, 3]
 */
export const mapValues = <O, const Key extends keyof O>(list: Iterable<O>, key: Key, take?: number): O[Key][] => {
  return Array.from(list)
    .slice(0, take)
    .map((object) => object[key]);
};

/**
 * Maps an iterable of values to an array of records with a specified key.
 *
 * @param list The iterable of values to map.
 * @param key The key to use for each record.
 * @returns An array of records with the specified key and corresponding values.
 * @example
 * mapRecords([1, 2, 3], 'id') // [{ id: 1 }, { id: 2 }, { id: 3 }]
 */
export const mapRecords = <Value, const Key extends string>(list: Iterable<Value>, key: Key): Record<Key, Value>[] => {
  return Array.from(list).map((value) => ({ [key]: value })) as Record<Key, Value>[];
};

/**
 * Creates a new object with only the specified properties of the original object.
 *
 * @param object - The original object to pick properties from.
 * @param keys - The keys of the properties to pick.
 * @returns A new object with only the specified properties of the original object.
 */
export const pick = <T extends Record<string, unknown>, K extends keyof T>(object: T, keys: K[]): Pick<T, K> => {
  const final = {} as Pick<T, K>;
  for (const key of keys) {
    final[key] = object[key];
  }
  return final;
};

/**
 * Returns a new object with the specified keys omitted.
 *
 * @param object The input object.
 * @param keys The keys to omit.
 * @returns A new object with the specified keys omitted.
 */
export const omit = <T extends Record<string, unknown>, K extends keyof T>(object: T, keys: K[]): Omit<T, K> => {
  const final = { ...object };
  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete final[key];
  }
  return final;
};
