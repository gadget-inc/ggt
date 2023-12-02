import type { GraphQLError } from "graphql";
import type { SetOptional } from "type-fest";
import type { CloseEvent, ErrorEvent } from "ws";
import { z } from "zod";

export const isNil = (val: unknown): val is null | undefined => {
  return val === null || val === undefined;
};

export const isString = (val: unknown): val is string => {
  return typeof val === "string";
};

export const isObject = (val: unknown): val is object => {
  return val instanceof Object;
};

// eslint-disable-next-line @typescript-eslint/ban-types
export const isFunction = (val: unknown): val is Function => {
  return typeof val === "function";
};

export const isError = (val: unknown): val is Error => {
  return val instanceof Error;
};

export const isCloseEvent = (e: unknown): e is SetOptional<CloseEvent, "target"> => {
  return z.object({ type: z.string(), code: z.number(), reason: z.string(), wasClean: z.boolean() }).safeParse(e).success;
};

export const isErrorEvent = (e: unknown): e is SetOptional<ErrorEvent, "target"> => {
  return z.object({ type: z.string(), message: z.string(), error: z.any() }).safeParse(e).success;
};

export const isGraphQLErrors = (e: unknown): e is readonly GraphQLError[] => {
  return z.array(z.object({ message: z.string() })).safeParse(e).success;
};

export const isNever = (value: never): never => {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Unexpected value: ${value}`);
};

export const isAbortError = (error: unknown): error is Error => {
  return (error instanceof Error && error.name === "AbortError") || (error instanceof Event && error.type === "abort");
};
