import arg from "arg";
import chalk from "chalk";
import type { Simplify } from "type-fest";

import { GGTError, IsBug, UnexpectedError } from "../output/report.js";
import { symbol } from "../output/symbols.js";
import { isNil } from "../util/is.js";

export type FlagDef = {
  name: string;
  aliases: string[];
  type: "boolean" | "string" | "number" | "count";
  description: string;
  details?: string;
  valueName?: string;
  hidden?: boolean;
  brief?: boolean;
  hasCompleter?: boolean;
};

export type ArgsDefinition = Record<string, ArgDefinition>;

type AliasEntry = string | { name: string; hidden: true };

export const hidden = (name: string): AliasEntry => ({ name, hidden: true });

type ArgDefinition<Handler extends arg.Handler = arg.Handler> = {
  type: Handler;
  alias?: AliasEntry | AliasEntry[];
  default?: ReturnType<Handler>;
  description?: string;
  details?: string;
  valueName?: string;
  hidden?: boolean;
  brief?: boolean;
  complete?: (ctx: import("./context.js").Context, partial: string, argv: string[]) => Promise<string[]>;
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

export const toEntryArray = (alias: AliasEntry | AliasEntry[] | undefined): AliasEntry[] => {
  if (!alias) {
    return [];
  }
  return Array.isArray(alias) ? alias : [alias];
};

export const aliasName = (entry: AliasEntry): string => (typeof entry === "string" ? entry : entry.name);

export const allFlagNames = (key: string, def: ArgDefinition): string[] => [key, ...toEntryArray(def.alias).map(aliasName)];

const isVisibleAlias = (entry: AliasEntry): boolean => typeof entry === "string";

export const parseArgs = <Args extends ArgsDefinition>(args: Args, options?: arg.Options): ArgsDefinitionResult<Args> => {
  const spec: arg.Spec = {};
  const defaultValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    spec[key] = value.type;
    defaultValues[key] = value.default;

    for (const entry of toEntryArray(value.alias)) {
      spec[aliasName(entry)] = key;
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
  usageHint: boolean;
  usageHintText?: string;

  constructor(message: string, options?: { usageHint?: boolean }) {
    super(message);
    this.usageHint = options?.usageHint ?? true;
  }

  attachUsageHint(text: string): void {
    if (!this.usageHintText) {
      this.usageHintText = text;
    }
  }

  protected override render(): string {
    let output = `${chalk.redBright(symbol.cross)} ` + this.message;
    if (this.usageHintText) {
      output += "\n\n" + this.usageHintText;
    }
    return output;
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
  // Filter out index-signature keys (widened 'string') so only literal flag keys appear in the result type.
  [Key in Keys as string extends Key ? never : Key]: Args[Key] extends ArgDefinition<infer Handler>
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
 *
 * The returned array includes flags where `hidden === true`. Callers are
 * responsible for filtering them before display (e.g. `usage.ts` filters
 * with `allFlags.filter((f) => !f.hidden)`).
 */
export const extractFlags = (args: ArgsDefinition): FlagDef[] => {
  const flags: FlagDef[] = [];

  for (const [key, value] of Object.entries(args)) {
    const aliases = toEntryArray(value.alias).filter(isVisibleAlias).map(aliasName);

    const type = resolveType(value.type);
    const description = value.description ?? "";

    const flag: FlagDef = { name: key, aliases, type, description };
    if (value.details !== undefined) flag.details = value.details;
    if (value.valueName !== undefined) flag.valueName = value.valueName;
    if (value.hidden !== undefined) flag.hidden = value.hidden;
    if (value.brief !== undefined) flag.brief = value.brief;
    if (typeof value.complete === "function") flag.hasCompleter = true;
    flags.push(flag);
  }

  return flags;
};

/**
 * Collects all flag names and aliases into a flat word list.
 */
export const flagWords = (flags: FlagDef[]): string[] => {
  const words: string[] = [];
  for (const f of flags) {
    words.push(f.name);
    for (const a of f.aliases) {
      words.push(a);
    }
  }
  return words;
};
