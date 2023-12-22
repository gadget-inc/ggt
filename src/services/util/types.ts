import type { Promisable, Simplify } from "type-fest";

/**
 * Makes all properties of an object optional, except for the specified
 * properties.
 */
export type PartialExcept<T, K extends keyof T> = Simplify<Partial<T> & Pick<T, K>>;

/**
 * Represents a function that can accept any number of arguments
 * and returns any value.
 */
export type AnyFunction = (...args: never[]) => unknown;

/**
 * Represents void or Promise<void>.
 */
export type AnyVoid = Promisable<void>;
