export const compact = (array: unknown[]) => {
  return array.filter((value) => Boolean(value));
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
