import type { ExecutionResult, GraphQLError } from "graphql";
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
  return typeof val === "object" && val !== null;
};

export const isArray = Array.isArray;

// oxlint-disable-next-line no-unsafe-function-type
export const isFunction = (val: unknown): val is Function => {
  return typeof val === "function";
};

export const isStringArray = (val: unknown): val is string[] => {
  return z.array(z.string()).safeParse(val).success;
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

export const isGraphQLResult = (val: unknown): val is ExecutionResult => {
  return z
    .union([
      z.object({ data: z.record(z.unknown()) }),
      z.object({ errors: z.array(z.object({ message: z.string() })) }),
      z.object({
        data: z.record(z.unknown()),
        errors: z.array(z.object({ message: z.string() })),
      }),
    ])
    .safeParse(val).success;
};

export const isGraphQLErrors = (e: unknown): e is readonly GraphQLError[] => {
  return z
    .array(
      z.object({
        message: z.string(),
        extensions: z
          .record(z.unknown())
          .nullish()
          .transform((ext) => ext ?? {}),
      }),
    )
    .min(1)
    .safeParse(e).success;
};

export const isNever = (value: never): never => {
  // oxlint-disable-next-line restrict-template-expressions
  throw new Error(`Unexpected value: ${value}`);
};

export const isAbortError = (error: unknown): error is Error | Event => {
  return (error instanceof Error && error.name === "AbortError") || (error instanceof Event && error.type === "abort");
};

export const isENOENTError = (error: unknown): error is { code: "ENOENT" } => {
  return isObject(error) && "code" in error && error.code === "ENOENT";
};

export const isENOTEMPTYError = (error: unknown): error is { code: "ENOTEMPTY" } => {
  return isObject(error) && "code" in error && error.code === "ENOTEMPTY";
};

export const isENOTDIRError = (error: unknown): error is { code: "ENOTDIR" } => {
  return isObject(error) && "code" in error && error.code === "ENOTDIR";
};

export const isEEXISTError = (error: unknown): error is { code: "EEXIST" } => {
  return isObject(error) && "code" in error && error.code === "EEXIST";
};

export const isJavaScriptFile = (filepath: string): boolean => {
  return [".js", ".jsx", ".cjs", ".mjs"].some((ext) => filepath.endsWith(ext));
};

export const isTypeScriptFile = (filepath: string): boolean => {
  return [".ts", ".tsx", ".cts", ".mts"].some((ext) => filepath.endsWith(ext) && !filepath.endsWith(".d.ts"));
};

export const isGellyFile = (filepath: string): boolean => {
  return filepath.endsWith(".gelly");
};
