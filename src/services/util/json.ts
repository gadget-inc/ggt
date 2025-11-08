// oxlint-disable consistent-type-definitions
declare global {
  interface BigInt {
    toJSON?(): string;
  }
  interface Map<K, V> {
    toJSON?(): Record<string, V>;
  }
  interface Set<T> {
    toJSON?(): T[];
  }
}

const bigintToJSON = function (this: bigint): string {
  return String(this);
};

const mapToJSON = function <K, V>(this: Map<K, V>): Record<string, V> {
  // oxlint-disable-next-line no-unsafe-return
  return Object.fromEntries(this);
};

const setToJSON = function <T>(this: Set<T>): T[] {
  return Array.from(this);
};

export const installJsonExtensions = (): void => {
  if (!Object.prototype.hasOwnProperty.call(BigInt, "toJSON")) {
    BigInt.prototype.toJSON = bigintToJSON;
  }

  if (!Object.prototype.hasOwnProperty.call(Map, "toJSON")) {
    Map.prototype.toJSON = mapToJSON;
  }

  if (!Object.prototype.hasOwnProperty.call(Set, "toJSON")) {
    Set.prototype.toJSON = setToJSON;
  }
};

export const uninstallJsonExtensions = (): void => {
  if (BigInt.prototype.toJSON === bigintToJSON) {
    delete BigInt.prototype.toJSON;
  }

  if (Map.prototype.toJSON === mapToJSON) {
    delete Map.prototype.toJSON;
  }

  if (Set.prototype.toJSON === setToJSON) {
    delete Set.prototype.toJSON;
  }
};
