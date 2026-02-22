import fs from "fs-extra";

import type { Run, SubcommandDef } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";

import { Edit } from "../services/app/edit/edit.js";
import {
  DELETE_ENVIRONMENT_VARIABLE_MUTATION,
  ENVIRONMENT_VARIABLES_QUERY,
  SET_ENVIRONMENT_VARIABLE_MUTATION,
} from "../services/app/edit/operation.js";
import { ClientError } from "../services/app/error.js";
import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError, parseArgs, type ArgsDefinition, type ParseArgsOptions } from "../services/command/arg.js";
import { renderDetailedUsage, renderShortUsage } from "../services/command/usage.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { confirm } from "../services/output/confirm.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";

export const description = "Manage environment variables";

export const examples = [
  "ggt var list --app=my-app --env=development",
  "ggt var set API_KEY=abc123 --secret",
  "ggt var delete --all --force",
  "ggt var import --from=staging --all",
] as const;

export const positional = "<command>";

export const args = {
  ...AppIdentityArgs,
} satisfies ArgsDefinition;

export const parseOptions: ParseArgsOptions = { permissive: true };

const setArgs = {
  "--secret": { type: Boolean, description: "Mark variables as secret" },
} satisfies ArgsDefinition;

const deleteArgs = {
  "--force": { type: Boolean, alias: "-f", description: "Skip confirmation and suppress not-found errors" },
  "--all": { type: Boolean, description: "Delete all environment variables" },
} satisfies ArgsDefinition;

const importArgs = {
  "--from": { type: String, description: "Import from another environment", valueName: "environment" },
  "--from-file": { type: String, description: "Import from a .env file", valueName: "path" },
  "--include-values": { type: Boolean, description: "Copy values when importing from another environment" },
  "--all": { type: Boolean, description: "Import all variables instead of specifying keys" },
} satisfies ArgsDefinition;

export const subcommandDefs: readonly SubcommandDef[] = [
  {
    name: "list",
    description: "List all environment variables",
    examples: ["ggt var list --app=myapp --env=development"],
  },
  {
    name: "get",
    description: "Get the value of an environment variable",
    examples: ["ggt var get DATABASE_URL --app=myapp --env=development"],
  },
  {
    name: "set",
    description: "Set one or more environment variables",
    args: setArgs,
    examples: ["ggt var set API_KEY=abc123", "ggt var set SECRET_KEY=xyz --secret", "ggt var set KEY1=val1 KEY2=val2"],
  },
  {
    name: "delete",
    description: "Delete one or more environment variables",
    args: deleteArgs,
    examples: ["ggt var delete API_KEY", "ggt var delete --all --force"],
  },
  {
    name: "import",
    description: "Import environment variables from another environment or file",
    args: importArgs,
    examples: [
      "ggt var import --from=staging --all",
      "ggt var import --from=staging --include-values API_KEY DATABASE_URL",
      "ggt var import --from-file=.env.example --all",
    ],
  },
];

export const run: Run<typeof args> = async (ctx, args) => {
  const subcommand = args._.shift();

  // handle -h/--help for subcommand-specific help
  if (args._.includes("-h") || args._.includes("--help")) {
    if (subcommand) {
      const def = subcommandDefs.find((d) => d.name === subcommand);
      if (def) {
        println(
          renderShortUsage("var " + subcommand, {
            description: def.description,
            args: { ...AppIdentityArgs, ...def.args },
            examples: def.examples ?? [],
          }),
        );
        process.exit(0);
      }
    }
    const mod = await import("./var.js");
    println(renderDetailedUsage("var", mod));
    process.exit(0);
  }

  if (!subcommand) {
    const mod = await import("./var.js");
    println(renderDetailedUsage("var", mod));
    return;
  }

  if (!subcommandDefs.some((d) => d.name === subcommand)) {
    throw new ArgError(sprint`
      Unknown subcommand {yellow ${subcommand}}

      Run {gray ggt var -h} for usage
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const appIdentity = await AppIdentity.load(ctx, { command: "var", args, directory });

  switch (subcommand) {
    case "list":
      await runList(appIdentity);
      break;
    case "get":
      await runGet(appIdentity, args._);
      break;
    case "set":
      await runSet(appIdentity, args._);
      break;
    case "delete":
      await runDelete(appIdentity, args._);
      break;
    case "import":
      await runImport(ctx, appIdentity, args._);
      break;
  }
};

const runList = async (appIdentity: AppIdentity): Promise<void> => {
  const data = await appIdentity.edit.query({ query: ENVIRONMENT_VARIABLES_QUERY });
  const vars = data.environmentVariables;

  if (vars.length === 0) {
    println("No environment variables found.");
    return;
  }

  for (const v of vars) {
    println(v.key);
  }
};

const runGet = async (appIdentity: AppIdentity, positional: string[]): Promise<void> => {
  const key = positional.shift();
  if (!key) {
    throw new ArgError(sprint`
      Missing required argument: key

      Run {gray ggt var get -h} for usage
    `);
  }

  const data = await appIdentity.edit.query({ query: ENVIRONMENT_VARIABLES_QUERY });
  const envVar = data.environmentVariables.find((v) => v.key === key);

  if (!envVar) {
    throw new ArgError(sprint`
      Environment variable not found: ${key}
    `);
  }

  if (envVar.isSecret) {
    throw new ArgError(sprint`
      ${key} is a secret and its value cannot be read
    `);
  }

  println(envVar.value ?? "");
};

const runSet = async (appIdentity: AppIdentity, positional: string[]): Promise<void> => {
  const subArgs = parseArgs(setArgs, { argv: positional });
  const pairs = subArgs._;
  const isSecret = subArgs["--secret"] ?? false;

  if (pairs.length === 0) {
    throw new ArgError(sprint`
      Missing required argument: key=value

      Run {gray ggt var set -h} for usage
    `);
  }

  const parsed: { key: string; value: string }[] = [];
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) {
      throw new ArgError(sprint`
        Invalid format: ${pair}

        Expected format: KEY=value
      `);
    }
    const key = pair.slice(0, eqIndex);
    if (!key) {
      throw new ArgError(sprint`
        Invalid format: ${pair}

        Expected format: KEY=value
      `);
    }
    parsed.push({
      key,
      value: pair.slice(eqIndex + 1),
    });
  }

  for (const { key, value } of parsed) {
    await appIdentity.edit.mutate({
      mutation: SET_ENVIRONMENT_VARIABLE_MUTATION,
      variables: { input: { key, value, isSecret } },
    });
  }

  const keys = parsed.map((p) => p.key).join(", ");
  println(`${symbol.tick} Set ${keys}`);
};

const runDelete = async (appIdentity: AppIdentity, positional: string[]): Promise<void> => {
  const subArgs = parseArgs(deleteArgs, { argv: positional });
  const keys = subArgs._;
  const force = subArgs["--force"] ?? false;
  const all = subArgs["--all"] ?? false;

  let keysToDelete: string[];

  if (all) {
    const data = await appIdentity.edit.query({ query: ENVIRONMENT_VARIABLES_QUERY });
    const vars = data.environmentVariables;

    if (vars.length === 0) {
      println("No environment variables to delete.");
      return;
    }

    keysToDelete = vars.map((v) => v.key);

    if (!force) {
      println`
        The following environment variables will be deleted:

          ${keysToDelete.map((k) => `• ${k}`).join("\n          ")}
      `;
      await confirm("Are you sure you want to delete all environment variables?");
    }
  } else {
    if (keys.length === 0) {
      throw new ArgError(sprint`
        Missing required argument: key

        Run {gray ggt var delete -h} for usage
      `);
    }

    keysToDelete = keys;

    if (!force) {
      await confirm(`Are you sure you want to delete ${keysToDelete.join(", ")}?`);
    }
  }

  for (const key of keysToDelete) {
    try {
      await appIdentity.edit.mutate({
        mutation: DELETE_ENVIRONMENT_VARIABLE_MUTATION,
        variables: { key },
      });
    } catch (error) {
      const isNotFound =
        error instanceof ClientError &&
        Array.isArray(error.cause) &&
        error.cause.every((e: unknown) => typeof e === "object" && e !== null && "message" in e && /not found/i.test(String(e.message)));

      if (force && isNotFound) {
        // suppress not-found errors when --force is used
        continue;
      }
      throw error;
    }
  }

  println(`${symbol.tick} Deleted ${keysToDelete.join(", ")}`);
};

const runImport = async (ctx: Context, appIdentity: AppIdentity, positional: string[]): Promise<void> => {
  const subArgs = parseArgs(importArgs, { argv: positional });
  const from = subArgs["--from"];
  const fromFile = subArgs["--from-file"];
  const includeValues = subArgs["--include-values"] ?? false;
  const all = subArgs["--all"] ?? false;
  const specifiedKeys = subArgs._;

  if (!from && !fromFile) {
    throw new ArgError(sprint`
      Either --from or --from-file is required.

      Run {gray ggt var import -h} for usage
    `);
  }

  if (from && fromFile) {
    throw new ArgError(sprint`
      Cannot use both --from and --from-file.

      Run {gray ggt var import -h} for usage
    `);
  }

  if (!all && specifiedKeys.length === 0) {
    throw new ArgError(sprint`
      Specify keys to import or use --all to import all variables.

      Run {gray ggt var import -h} for usage
    `);
  }

  if (from) {
    await importFromEnvironment(ctx, appIdentity, from, specifiedKeys, all, includeValues);
  } else if (fromFile) {
    await importFromFile(appIdentity, fromFile, specifiedKeys, all);
  }
};

const importFromEnvironment = async (
  ctx: Context,
  appIdentity: AppIdentity,
  sourceName: string,
  specifiedKeys: string[],
  all: boolean,
  includeValues: boolean,
): Promise<void> => {
  const sourceEnvironment = appIdentity.application.environments.find((env) => env.name === sourceName.toLowerCase());
  if (!sourceEnvironment) {
    throw new ArgError(sprint`
      Unknown environment: ${sourceName}

      Available environments:
        ${appIdentity.application.environments.map((e) => `• ${e.name}`).join("\n        ")}
    `);
  }

  const sourceEdit = new Edit(ctx, { ...sourceEnvironment, application: appIdentity.application });

  try {
    const data = await sourceEdit.query({ query: ENVIRONMENT_VARIABLES_QUERY });
    let vars = data.environmentVariables;

    if (!all) {
      const missing = specifiedKeys.filter((k) => !vars.some((v) => v.key === k));
      if (missing.length > 0) {
        throw new ArgError(sprint`
          The following keys were not found in the ${sourceName} environment:

            ${missing.map((k) => `• ${k}`).join("\n            ")}
        `);
      }
      vars = vars.filter((v) => specifiedKeys.includes(v.key));
    }

    if (vars.length === 0) {
      println(`No environment variables found in ${sourceName}.`);
      return;
    }

    const imported: string[] = [];
    const skipped: string[] = [];

    for (const v of vars) {
      if (includeValues) {
        if (v.isSecret) {
          // can't copy secret values (they come back as null)
          skipped.push(v.key);
          continue;
        }
        await appIdentity.edit.mutate({
          mutation: SET_ENVIRONMENT_VARIABLE_MUTATION,
          variables: { input: { key: v.key, value: v.value ?? "", isSecret: v.isSecret } },
        });
      } else {
        // import as placeholder (empty value, non-secret)
        await appIdentity.edit.mutate({
          mutation: SET_ENVIRONMENT_VARIABLE_MUTATION,
          variables: { input: { key: v.key, value: "", isSecret: false } },
        });
      }
      imported.push(v.key);
    }

    if (imported.length > 0) {
      println(`${symbol.tick} Imported ${imported.join(", ")} from ${sourceName}`);
    }

    if (skipped.length > 0) {
      println(`Skipped secret variables (values not accessible): ${skipped.join(", ")}`);
    }
  } finally {
    await sourceEdit.dispose();
  }
};

const importFromFile = async (appIdentity: AppIdentity, filePath: string, specifiedKeys: string[], all: boolean): Promise<void> => {
  const content = await fs.readFile(filePath, "utf8");
  const entries = parseEnvFile(content);

  if (entries.length === 0) {
    println("No environment variables found in file.");
    return;
  }

  let filtered: { key: string; value: string }[];
  if (all) {
    filtered = entries;
  } else {
    const missing = specifiedKeys.filter((k) => !entries.some((e) => e.key === k));
    if (missing.length > 0) {
      throw new ArgError(sprint`
        The following keys were not found in the file:

          ${missing.map((k) => `• ${k}`).join("\n          ")}
      `);
    }
    filtered = entries.filter((e) => specifiedKeys.includes(e.key));
  }

  for (const { key, value } of filtered) {
    await appIdentity.edit.mutate({
      mutation: SET_ENVIRONMENT_VARIABLE_MUTATION,
      variables: { input: { key, value, isSecret: false } },
    });
  }

  const keys = filtered.map((e) => e.key).join(", ");
  println(`${symbol.tick} Imported ${keys} from ${filePath}`);
};

const parseEnvFile = (content: string): { key: string; value: string }[] => {
  const entries: { key: string; value: string }[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    // skip blank lines and comments
    if (!line || line.startsWith("#")) {
      continue;
    }

    // strip optional "export " prefix
    const stripped = line.startsWith("export ") ? line.slice(7) : line;

    const eqIndex = stripped.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = stripped.slice(0, eqIndex).trim();
    let value = stripped.slice(eqIndex + 1).trim();

    // strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) {
      entries.push({ key, value });
    }
  }

  return entries;
};
