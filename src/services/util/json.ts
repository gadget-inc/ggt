/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/consistent-type-definitions */

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

export const installJsonExtensions = (): void => {
  if (!Object.prototype.hasOwnProperty.call(BigInt, "toJSON")) {
    BigInt.prototype.toJSON = function () {
      return String(this);
    };
  }

  if (!Object.prototype.hasOwnProperty.call(Map, "toJSON")) {
    Map.prototype.toJSON = function () {
      return Object.fromEntries(this);
    };
  }

  if (!Object.prototype.hasOwnProperty.call(Set, "toJSON")) {
    Set.prototype.toJSON = function () {
      return Array.from(this);
    };
  }
};

export const uninstallJsonExtensions = (): void => {
  if (Object.prototype.hasOwnProperty.call(BigInt, "toJSON")) {
    delete BigInt.prototype.toJSON;
  }

  if (Object.prototype.hasOwnProperty.call(Map, "toJSON")) {
    delete Map.prototype.toJSON;
  }

  if (Object.prototype.hasOwnProperty.call(Set, "toJSON")) {
    delete Set.prototype.toJSON;
  }
};
