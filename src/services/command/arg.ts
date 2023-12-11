import arg from "arg";
import type { Simplify } from "type-fest";
import { CLIError, IsBug, UnexpectedError } from "../output/report.js";
import { isNil } from "../util/is.js";

export type ArgsSpec = Record<string, ArgDefinition>;

type ArgDefinition<Handler extends arg.Handler = arg.Handler> =
  | Handler
  | {
      type: Handler;
      alias?: string | string[];
      default?: ReturnType<Handler>;
    };

export const parseArgs = <Args extends ArgsSpec>(args: Args, options?: arg.Options): ArgsSpecResult<Args> => {
  const realSpec: arg.Spec = {};
  const defaultValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (!("type" in value)) {
      realSpec[key] = value;
      continue;
    }

    realSpec[key] = value.type;
    defaultValues[key] = value.default;

    if (value.alias) {
      for (const alias of Array.isArray(value.alias) ? value.alias : [value.alias]) {
        realSpec[alias] = key;
      }
    }
  }

  try {
    const parsed = arg(realSpec, options);
    for (const [key, value] of Object.entries(defaultValues)) {
      if (isNil(parsed[key])) {
        parsed[key] = value as never;
      }
    }
    return parsed as ArgsSpecResult<Args>;
  } catch (error: unknown) {
    if (error instanceof arg.ArgError) {
      // convert arg.ArgError to CLIError
      // eslint-disable-next-line no-ex-assign
      error = new ArgError(error.message);
    }
    if (error instanceof CLIError) {
      throw error;
    }
    throw new UnexpectedError(error);
  }
};

export class ArgError extends CLIError {
  isBug = IsBug.NO;

  protected override render(): string {
    return this.message;
  }
}

export type ArgsSpecResult<Spec extends ArgsSpec, Args extends keyof Spec = keyof Spec> = Simplify<{
  [Arg in Args]: Spec[Arg] extends ArgDefinition<infer Handler>
    ? Spec[Arg] extends { default: unknown }
      ? NonNullable<ReturnType<Handler>>
      : ReturnType<Handler> | undefined
    : never;
}> & { _: string[] };
