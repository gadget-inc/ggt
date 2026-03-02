import assert from "node:assert";

import type { Promisable } from "type-fest";

import colors from "../output/colors.js";
import { memo, MemoFirstCall } from "../util/function.js";
import type { ArgsDefinition, ArgsDefinitionResult, ParseArgsOptions } from "./arg.js";
import type { Context } from "./context.js";

/**
 * The list of available commands.
 *
 * 1. Every command corresponds to a file inside of src/commands/
 * 2. The order determines the order of commands in the README
 */
export const Commands = [
  "dev",
  "deploy",
  "status",
  "problems",
  "push",
  "pull",
  "var",
  "env",
  "add",
  "shopify",
  "open",
  "list",
  "login",
  "logout",
  "logs",
  "debugger",
  "whoami",
  "configure",
  "agent-plugin",
  "eval",
  "version",
] as const;

/**
 * One of the commands in {@link Commands}.
 */
export type Command = (typeof Commands)[number];

/**
 * A positional argument definition used in the declarative command API.
 * The placeholder shown in the usage line is derived from `name` and `required`
 * when not explicitly provided: required args use `<name>`, optional use `[name]`.
 */
export type PositionalDef = {
  name: string;
  description?: string;
  details?: string;
  /** Whether this positional argument is required. Defaults to false. */
  required?: boolean;
  /** Explicit placeholder for the usage line, e.g. "[DIRECTORY]" or "<shell>". Derived from `name` when omitted. */
  placeholder?: string;
};

/**
 * A leaf command that directly executes a run function.
 * The `subcommands` field is `never` to discriminate from parent commands.
 */
export type LeafCommandConfig<A extends ArgsDefinition = ArgsDefinition> = {
  name: string;
  description: string;
  hidden?: boolean;
  positionals?: readonly PositionalDef[];
  args?: A;
  parseOptions?: ParseArgsOptions;
  aliases?: readonly string[];
  details?: string;
  examples?: readonly string[];
  sections?: readonly { title: string; content: string }[];
  run: (ctx: Context, args: ArgsDefinitionResult<A>) => Promisable<void>;
  subcommands?: never;
};

/**
 * A subcommand within a parent command, combining parent args with its own.
 */
export type SubcommandConfig<PA extends ArgsDefinition = {}, SA extends ArgsDefinition = {}> = {
  description: string;
  details?: string;
  aliases?: readonly string[];
  positionals?: readonly PositionalDef[];
  args?: SA;
  examples?: readonly string[];
  run: (ctx: Context, args: ArgsDefinitionResult<PA & SA>) => Promisable<void>;
};

/**
 * Type-erased subcommand entry stored in a parent command's `subcommands` record.
 * Preserves the structural fields needed for dispatch and help rendering
 * without carrying the generic SA parameter that causes variance issues.
 */
export type StoredSubcommand = Omit<SubcommandConfig, "run" | "args"> & {
  args?: ArgsDefinition;
  run: (ctx: Context, args: never) => Promisable<void>;
};

/**
 * Helper function passed to the `subcommands` callback in parent commands.
 * Accepts a fully-typed `SubcommandConfig` for inference inside `run`,
 * then returns the type-erased `StoredSubcommand` for storage.
 */
export type SubHelper<PA extends ArgsDefinition> = <SA extends ArgsDefinition = {}>(config: SubcommandConfig<PA, SA>) => StoredSubcommand;

/**
 * The input shape for the `subcommands` callback in parent commands.
 */
export type ParentInput<PA extends ArgsDefinition> = (sub: SubHelper<PA>) => Record<string, StoredSubcommand>;

/**
 * A parent command that dispatches to subcommands.
 * The `run` field is `never` to discriminate from leaf commands.
 */
export type ParentCommandConfig<PA extends ArgsDefinition = ArgsDefinition> = {
  name: string;
  description: string;
  hidden?: boolean;
  positionals?: readonly PositionalDef[];
  args?: PA;
  parseOptions?: ParseArgsOptions;
  aliases?: readonly string[];
  details?: string;
  examples?: readonly string[];
  sections?: readonly { title: string; content: string }[];
  subcommands: Record<string, StoredSubcommand>;
  run?: never;
};

/**
 * A command config is either a leaf command or a parent command.
 * Uses `any` for the args type parameter so concretely-typed commands
 * are assignable without variance issues at dispatch boundaries.
 */
// oxlint-disable-next-line no-explicit-any -- required for variance at dispatch boundaries
export type CommandConfig = LeafCommandConfig<any> | ParentCommandConfig<any>;

/**
 * Creates a leaf command configuration with full type inference.
 * When `args` is provided, the return type preserves it as required.
 */
export function defineCommand<A extends ArgsDefinition>(
  config: LeafCommandConfig<A> & { name: string; args: A },
): LeafCommandConfig<A> & { args: A };
export function defineCommand<A extends ArgsDefinition>(config: LeafCommandConfig<A> & { name: string }): LeafCommandConfig<A>;

/**
 * Creates a parent command configuration with full type inference.
 * The `subcommands` callback receives a `sub` helper for defining subcommands.
 */
export function defineCommand<PA extends ArgsDefinition = {}>(
  config: Omit<ParentCommandConfig<PA>, "subcommands"> & { name: string; subcommands: ParentInput<PA> },
): ParentCommandConfig<PA>;

export function defineCommand(
  config:
    | LeafCommandConfig<ArgsDefinition>
    | (Omit<ParentCommandConfig<ArgsDefinition>, "subcommands"> & { subcommands: ParentInput<ArgsDefinition> }),
): CommandConfig {
  if ("subcommands" in config && typeof config.subcommands === "function") {
    // Safe identity cast: the generic SA parameter only affects TypeScript inference at the call site; at runtime sub returns its argument unchanged.
    const sub: SubHelper<ArgsDefinition> = (subConfig) => subConfig;
    return { ...config, subcommands: config.subcommands(sub) } as ParentCommandConfig;
  }
  return config as LeafCommandConfig;
}

/**
 * Checks if a string is a valid command.
 *
 * @param command - The string to check
 * @returns Whether the string is a valid command
 */
export const isCommand = (command: string): command is Command => {
  return Commands.includes(command as Command);
};

/**
 * Imports a command's default export.
 *
 * @param cmd - The command to import
 * @see {@linkcode CommandConfig}
 */
export const importCommand = async (cmd: Command): Promise<CommandConfig> => {
  assert(isCommand(cmd), `invalid command: ${cmd}`);

  let module;
  switch (cmd) {
    case "dev":
      module = await import("../../commands/dev.js");
      break;
    case "deploy":
      module = await import("../../commands/deploy.js");
      break;
    case "status":
      module = await import("../../commands/status.js");
      break;
    case "problems":
      module = await import("../../commands/problems.js");
      break;
    case "push":
      module = await import("../../commands/push.js");
      break;
    case "pull":
      module = await import("../../commands/pull.js");
      break;
    case "var":
      module = await import("../../commands/var.js");
      break;
    case "env":
      module = await import("../../commands/env.js");
      break;
    case "add":
      module = await import("../../commands/add.js");
      break;
    case "shopify":
      module = await import("../../commands/shopify.js");
      break;
    case "open":
      module = await import("../../commands/open.js");
      break;
    case "list":
      module = await import("../../commands/list.js");
      break;
    case "login":
      module = await import("../../commands/login.js");
      break;
    case "logout":
      module = await import("../../commands/logout.js");
      break;
    case "logs":
      module = await import("../../commands/logs.js");
      break;
    case "debugger":
      module = await import("../../commands/debugger.js");
      break;
    case "whoami":
      module = await import("../../commands/whoami.js");
      break;
    case "configure":
      module = await import("../../commands/configure.js");
      break;
    case "agent-plugin":
      module = await import("../../commands/agent-plugin.js");
      break;
    case "eval":
      module = await import("../../commands/eval.js");
      break;
    case "version":
      module = await import("../../commands/version.js");
      break;
  }

  const config = module.default as CommandConfig | undefined;
  assert(config, `command module "src/commands/${cmd}.ts" has no default export`);
  assert(config.name === cmd, `command module "src/commands/${cmd}.ts" exports name "${config.name}" but was imported as "${cmd}"`);
  return config;
};

/** Command group definitions for root help display. */
export const commandGroups: readonly { label: string; commands: readonly Command[] }[] = [
  { label: "Development", commands: ["dev", "deploy", "push", "pull", "status", "logs", "debugger"] },
  { label: "Resources", commands: ["add", "shopify", "var", "env", "open"] },
  { label: "Account", commands: ["login", "logout", "whoami", "list"] },
  { label: "Diagnostics", commands: ["problems", "eval"] },
  { label: "Configuration", commands: ["configure", "agent-plugin", "version"] },
];

/** Loads all command modules once; subsequent calls return the cached result. */
const loadAllCommands = memo(MemoFirstCall, async () => {
  const p = Promise.all(Commands.map(async (cmd) => importCommand(cmd)));
  p.catch(() => loadAllCommands.clear());
  return p;
});

/**
 * Builds a formatted command list by importing each command module,
 * filtering out hidden commands. Returns grouped command lines
 * with bold group headers.
 */
export const renderCommandList = async (): Promise<string> => {
  const entries = await loadAllCommands();

  const visible = new Map(entries.filter((e) => !e.hidden).map((e) => [e.name, e.description] as const));
  if (visible.size === 0) return "";
  const maxCmd = Math.max(...[...visible.keys()].map((c) => c.length)) + 4;

  const lines: string[] = [];
  for (const group of commandGroups) {
    const groupEntries = group.commands.filter((c) => visible.has(c));
    if (groupEntries.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(colors.header(group.label));
    for (const cmd of groupEntries) {
      const padding = " ".repeat(Math.max(0, maxCmd - cmd.length));
      lines.push(`${colors.identifier.bold(cmd)}${padding}${visible.get(cmd) ?? ""}`);
    }
  }
  return lines.join("\n");
};

/**
 * Resolves a command alias by importing all commands and checking their aliases.
 * Only called when the input doesn't match a known command name.
 */
export const resolveCommandAlias = async (alias: string): Promise<Command | undefined> => {
  const entries = await loadAllCommands();
  for (const mod of entries) {
    if (mod.aliases?.includes(alias)) return mod.name as Command;
  }
  return undefined;
};
