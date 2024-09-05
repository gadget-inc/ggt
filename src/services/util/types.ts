/* eslint-disable @typescript-eslint/no-explicit-any */
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
export type AnyFunction = (...args: any[]) => unknown;

/**
 * Represents void or Promise<void>.
 */
export type AnyVoid = Promisable<void>;

/**
 * Returns all property names of an object whose values are functions.
 */
export type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/**
 * Returns the arguments of a function.
 */
export type ArgsType<T> = T extends (...args: infer A) => any ? A : never;

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };
/**
 * Represents a type that is either T or U, but not both.
 */
export type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U;
