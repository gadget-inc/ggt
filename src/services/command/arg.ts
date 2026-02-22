import type { Simplify } from "type-fest";

import arg from "arg";
import chalk from "chalk";

import { GGTError, IsBug, UnexpectedError } from "../output/report.js";
import { symbol } from "../output/symbols.js";
import { isNil } from "../util/is.js";

export type FlagDef = {
  name: string;
  aliases: string[];
  type: "boolean" | "string" | "number" | "count";
  description: string;
  valueName?: string;
};

export type ArgsDefinition = Record<string, ArgDefinition>;

type ArgDefinition<Handler extends arg.Handler = arg.Handler> =
  | Handler
  | {
      type: Handler;
      alias?: string | string[];
      default?: ReturnType<Handler>;
      description?: string;
      longDescription?: string;
      valueName?: string;
    };

export type ParseArgsOptions = {
  /**
   * A list of arguments to parse.
   */
  argv?: string[];

  /**
   * When permissive set to `true`, arg will push any unknown arguments
   * onto the "extra" argument array (`ctx.args._`) instead of throwing
   * an error about an unknown flag.
   *
   * @default false
   */
  permissive?: boolean;

  /**
   * When stopAtPositional is set to true, context will stop parsing at
   * the first positional argument.
   *
   * @default false
   */
  stopAtPositional?: boolean;
};

export const parseArgs = <Args extends ArgsDefinition>(args: Args, options?: arg.Options): ArgsDefinitionResult<Args> => {
  const spec: arg.Spec = {};
  const defaultValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (!("type" in value)) {
      spec[key] = value;
      continue;
    }

    spec[key] = value.type;
    defaultValues[key] = value.default;

    if (value.alias) {
      for (const alias of Array.isArray(value.alias) ? value.alias : [value.alias]) {
        spec[alias] = key;
      }
    }
  }

  try {
    const parsed = arg(spec, options);
    for (const [key, value] of Object.entries(defaultValues)) {
      if (isNil(parsed[key])) {
        parsed[key] = value as never;
      }
    }
    return parsed as ArgsDefinitionResult<Args>;
  } catch (error: unknown) {
    if (error instanceof arg.ArgError) {
      // convert arg.ArgError to GGTError
      // oxlint-disable-next-line no-ex-assign
      error = new ArgError(error.message);
    }
    if (error instanceof GGTError) {
      throw error;
    }
    throw new UnexpectedError(error);
  }
};

export class ArgError extends GGTError {
  isBug = IsBug.NO;

  protected override render(): string {
    return `${chalk.redBright(symbol.cross)} ` + this.message;
  }
}

/**
 * Turns this:
 * ```ts
 * type Args = {
 *   "--string": { type: String; alias: "s" };
 *   "--number": { type: Number; default: 42 };
 * };
 * ```
 *
 * Into this:
 * ```ts
 * type Result = {
 *  "--string": string | undefined;
 *  "--number": number;
 * };
 * ```
 */
export type ArgsDefinitionResult<Args extends ArgsDefinition, Keys extends keyof Args = keyof Args> = Simplify<{
  [Key in Keys]: Args[Key] extends ArgDefinition<infer Handler>
    ? Args[Key] extends { default: unknown }
      ? NonNullable<ReturnType<Handler>>
      : ReturnType<Handler> | undefined
    : never;
}> & { _: string[] };

const resolveType = (handler: unknown): FlagDef["type"] => {
  if (handler === Boolean) {
    return "boolean";
  }
  if (handler === String) {
    return "string";
  }
  if (handler === Number) {
    return "number";
  }
  if (handler === arg.COUNT) {
    return "count";
  }
  // custom handler functions default to string type
  return "string";
};

/**
 * Extracts flag definitions from an ArgsDefinition object.
 */
export const extractFlags = (args: ArgsDefinition): FlagDef[] => {
  const flags: FlagDef[] = [];

  for (const [key, value] of Object.entries(args)) {
    // skip short help flag -- help is universal, not per-command
    if (key === "-h") {
      continue;
    }

    const handler = typeof value === "function" ? value : value.type;
    const aliases: string[] = [];

    if (typeof value === "object" && "alias" in value && value.alias) {
      const raw = value.alias;
      for (const a of Array.isArray(raw) ? raw : [raw]) {
        aliases.push(a);
      }
    }

    const type = resolveType(handler);
    const description = typeof value === "object" && "description" in value ? (value.description ?? "") : "";
    const valueName = typeof value === "object" && "valueName" in value ? value.valueName : undefined;

    flags.push({ name: key, aliases, type, description, valueName });
  }

  return flags;
};
