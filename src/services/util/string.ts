export const ensureLength = (value: string, length: number): string => {
  if (value.length > length) {
    return value.slice(0, length - 1) + "…";
  }
  if (value.length < length) {
    return value.padEnd(length, " ");
  }
  return value;
};
