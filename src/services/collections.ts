import { isObject } from "./is.js";

export const compact = <T>(array: T[]): NonNullable<T>[] => {
  return array.filter((value): value is NonNullable<T> => Boolean(value));
};

export const uniq = <T>(array: T[]): T[] => {
  return [...new Set(array)];
};

export const mapValues = <O, const Key extends keyof O>(list: Iterable<O>, key: Key, take?: number): O[Key][] => {
  return Array.from(list)
    .slice(0, take)
    .map((object) => object[key]);
};

export const mapRecords = <Value, const Key extends string>(list: Iterable<Value>, key: Key): Record<Key, Value>[] => {
  return Array.from(list).map((value) => ({ [key]: value })) as Record<Key, Value>[];
};

export const pick = <T extends Record<string, unknown>, K extends keyof T>(object: T, keys: K[]): Pick<T, K> => {
  const final = {} as Pick<T, K>;
  for (const key of keys) {
    final[key] = object[key];
  }
  return final;
};

export const get = <T, K extends PropertyKey, R = K extends keyof T ? T[K] : unknown>(object: T, property: K): R => {
  if (isObject(object)) {
    // @ts-expect-error property might not exist on object which is why
    // we're using this function
    return object[property] as R;
  }
  return undefined as R;
};
