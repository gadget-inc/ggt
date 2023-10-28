export const compact = <T>(array: T[]): NonNullable<T>[] => {
  return array.filter((value): value is NonNullable<T> => Boolean(value));
};

export const uniq = <T>(array: T[]) => {
  return [...new Set(array)];
};

export const pick = <T extends Record<string, unknown>, K extends keyof T>(object: T, keys: K[]) => {
  const final = {} as Pick<T, K>;
  for (const key of keys) {
    final[key] = object[key];
  }
  return final;
};

export const mapValues = <O, const Key extends keyof O>(list: Iterable<O>, key: Key, take?: number): O[Key][] => {
  return Array.from(list)
    .slice(0, take)
    .map((object) => object[key]);
};

export const mapRecords = <Value, const Key extends string>(list: Iterable<Value>, key: Key): Record<Key, Value>[] => {
  return Array.from(list).map((value) => ({ [key]: value })) as Record<Key, Value>[];
};
