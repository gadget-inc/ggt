import type { Jsonifiable } from "type-fest";
import { map } from "./collections.js";

export type JsonifiableObject =
  | {
      [Key in string]?: Jsonifiable | bigint | Map<Jsonifiable, Jsonifiable> | Set<Jsonifiable>;
    }
  | { toJSON: () => Jsonifiable }
  | { error?: unknown };

export const withExtendedJSON = <T>(fn: () => T): T => {
  try {
    // @ts-expect-error does not exist
    BigInt.toJSON = function () {
      return String(this);
    };
    // @ts-expect-error does not exist
    Map.prototype.toJSON = function () {
      return Object.fromEntries(map(this, ([key, value]) => [String(key), value]));
    };
    // @ts-expect-error does not exist
    Set.prototype.toJSON = function () {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Array.from(this);
    };

    return fn();
  } finally {
    // @ts-expect-error does not exist
    BigInt.toJSON = undefined;
    // @ts-expect-error does not exist
    Map.prototype.toJSON = undefined;
    // @ts-expect-error does not exist
    Set.prototype.toJSON = undefined;
  }
};
