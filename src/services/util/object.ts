import cleanStack from "clean-stack";
import { RequestError } from "got";
import { inspect } from "node:util";
import { serializeError as baseSerializeError, type ErrorObject } from "serialize-error";
import type { Simplify } from "type-fest";
import { workspaceRoot } from "../config/paths.js";

/**
 * Returns a new object with the properties of the input object merged
 * with the properties of the defaults object. If a property exists in
 * both objects, the property of the input object will be used.
 *
 * @param input - The input object to merge with the defaults object.
 * @param defaults - The defaults object to merge with the input object.
 * @returns A new object with the properties of the input object merged
 * with the properties of the defaults object.
 */
export const defaults = <Input extends Record<string, unknown>, Defaults extends Partial<Input>>(
  input: Input | null | undefined,
  defaults: Defaults,
): Simplify<Defaults & Input> => {
  const result = { ...input };
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!result[key]) {
      result[key] = defaultValue;
    }
  }
  return result as Simplify<Defaults & Input>;
};

/**
 * Creates a new object with only the specified properties of the
 * original object.
 *
 * @param object - The original object to pick properties from.
 * @param keys - The keys of the properties to pick.
 * @returns A new object with only the specified properties of the
 * original object.
 */
export const pick = <T extends Record<string, unknown>, K extends keyof T>(object: T, keys: readonly K[]): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    result[key] = object[key];
  }
  return result;
};

/**
 * Returns a new object with the specified keys omitted.
 *
 * @param record The input object.
 * @param keys The keys to omit.
 * @returns A new object with the specified keys omitted.
 */
export const omit = <T extends Record<string, unknown>, K extends keyof T>(record: T, keys: readonly K[]): Omit<T, K> => {
  const result = { ...record };
  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete result[key];
  }
  return result;
};

/**
 * Maps the values of an object to a new set of values using the
 * provided function.
 *
 * @param obj The input object to map.
 * @param fn The function to apply to each value in the input object.
 * @returns A new object with the same keys as the input object, but
 * with the values mapped to new values using the provided function.
 */
export const mapValues = <Key extends string | number | symbol, Value, MappedValue>(
  obj: Record<Key, Value>,
  fn: (value: Value) => MappedValue,
): Record<Key, MappedValue> => {
  const result = {} as Record<Key, MappedValue>;
  for (const [key, value] of Object.entries(obj)) {
    result[key as Key] = fn(value as Value);
  }
  return result;
};

/**
 * Universal Error object to json blob serializer.
 *
 * Wraps `serialize-error` with some handy stuff, like special support
 * for Got HTTP errors
 */
export const serializeError = (error: unknown): ErrorObject => {
  let serialized = baseSerializeError(Array.isArray(error) ? new AggregateError(error) : error);
  if (typeof serialized == "string") {
    serialized = { message: serialized };
  }

  if (serialized.stack) {
    serialized.stack = cleanStack(serialized.stack, { pretty: true, basePath: workspaceRoot });
  }

  if (error instanceof RequestError) {
    serialized["timings"] = undefined;
    serialized["options"] = {
      method: error.options.method,
      url: error.options.url instanceof URL ? error.options.url.toJSON() : error.options.url,
    };
    serialized["responseBody"] = inspect(error.response?.body);
  }

  return serialized;
};
