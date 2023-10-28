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
