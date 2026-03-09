import fs from "fs-extra";

import { EnvArg } from "../services/app/app.js";
import { Edit } from "../services/app/edit/edit.js";
import {
  DELETE_ENVIRONMENT_VARIABLE_MUTATION,
  ENVIRONMENT_VARIABLES_QUERY,
  SET_ENVIRONMENT_VARIABLE_MUTATION,
} from "../services/app/edit/operation.js";
import { ClientError } from "../services/app/error.js";
import { AppIdentity, AppIdentityArgs, type AppIdentityArgsResult } from "../services/command/app-identity.js";
import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import { defineCommand } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import colors from "../services/output/colors.js";
import { confirm } from "../services/output/confirm.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";

const setArgs = {
  "--secret": {
    type: Boolean,
    alias: "-s",
    description: "Mark the variable as secret (write-only)",
    details:
      "Secret variables are write-only — their values cannot be read back after being set. Use this for API keys, tokens, and other sensitive values.",
  },
} satisfies ArgsDefinition;

const deleteArgs = {
  "--force": {
    type: Boolean,
    alias: "-f",
    description: "Skip confirmation and suppress not-found errors",
    details: "Skips the confirmation prompt and silently ignores keys that don't exist.",
  },
  "--all": {
    type: Boolean,
    description: "Delete all environment variables",
    details: "Deletes every variable in the environment. Combine with --force to skip confirmation.",
  },
} satisfies ArgsDefinition;

const importArgs = {
  "--from": {
    ...EnvArg,
    description: "Import from another environment",
    details: "The name of the source environment to import from. Cannot be combined with --from-file.",
  },
  "--from-file": {
    type: String,
    description: "Import from a .env file",
    valueName: "path",
    details: "Path to a .env file. Supports KEY=value format, comments (#), and quoted values. Cannot be combined with --from.",
  },
  "--include-values": {
    type: Boolean,
    description: "Copy values when importing from another env",
    details:
      "Without this flag, only the keys are imported as empty placeholders. Secret variable values cannot be copied between environments and are skipped.",
  },
  "--all": {
    type: Boolean,
    description: "Import all variables instead of specifying keys",
    details: "Imports every variable from the source instead of requiring individual key names.",
  },
} satisfies ArgsDefinition;

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
    throw new ArgError(
      sprint`
        Unknown environment: ${sourceName}

        Available environments:
          ${appIdentity.application.environments.map((e) => `• ${e.name}`).join("\n")}
      `,
      { usageHint: false },
    );
  }

  const sourceEdit = new Edit(ctx, { ...sourceEnvironment, application: appIdentity.application });

  try {
    const data = await sourceEdit.query({ query: ENVIRONMENT_VARIABLES_QUERY });
    let vars = data.environmentVariables;

    if (!all) {
      const missing = specifiedKeys.filter((k) => !vars.some((v) => v.key === k));
      if (missing.length > 0) {
        throw new ArgError(
          sprint`
            The following keys were not found in the ${sourceName} environment:

              ${missing.map((k) => `• ${k}`).join("\n")}
          `,
          { usageHint: false },
        );
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
      throw new ArgError(
        sprint`
          The following keys were not found in the file:

            ${missing.map((k) => `• ${k}`).join("\n")}
        `,
        { usageHint: false },
      );
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

const resolveAppIdentity = async (ctx: Context, args: AppIdentityArgsResult): Promise<AppIdentity> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  return AppIdentity.load(ctx, { command: "var", args, directory });
};

export default defineCommand({
  name: "var",
  description: "Manage your app's environment variables",
  details: sprint`
    Environment variables are available as ${colors.hint("process.env.YOUR_VAR")} in your app code. Use them
    for configuration like API keys and settings that differ between environments. Secret
    variables are write-only — their values cannot be read back after being set.
  `,
  examples: [
    "ggt var list",
    "ggt var get DATABASE_URL",
    "ggt var set API_KEY=abc123",
    "ggt var set SECRET=xyz --secret",
    "ggt var set CONNECTION_STRING=postgres://user:pass@host/db",
    "ggt var delete API_KEY",
    "ggt var delete --all --force",
    "ggt var import --from staging --all",
    "ggt var import --from-file .env --all",
  ],
  args: AppIdentityArgs,
  subcommands: (sub) => ({
    list: sub({
      description: "List all environment variable keys",
      details: sprint`
        Prints each variable key on its own line. Values are not shown — use
        ${colors.identifier("ggt var get")} to read a specific value.
      `,
      examples: ["ggt var list", "ggt var list --app myapp --env staging"],
      run: async (ctx, args) => {
        const appIdentity = await resolveAppIdentity(ctx, args);

        const data = await appIdentity.edit.query({ query: ENVIRONMENT_VARIABLES_QUERY });
        const vars = data.environmentVariables;

        if (vars.length === 0) {
          println("No environment variables found.");
          return;
        }

        for (const v of vars) {
          println(v.key);
        }
      },
    }),
    get: sub({
      description: "Print the value of an environment variable",
      details: sprint`
        Prints the value of a single variable. Secret variables are write-only
        and cannot be read back — an error is returned if you try.
      `,
      examples: ["ggt var get DATABASE_URL", "ggt var get API_KEY --app myapp --env staging"],
      positionals: [
        { name: "key", required: true, description: "Variable name", details: "Case-sensitive. Secret variables cannot be read back." },
      ],
      run: async (ctx, args) => {
        const appIdentity = await resolveAppIdentity(ctx, args);
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const key = args._[0]!;

        const data = await appIdentity.edit.query({ query: ENVIRONMENT_VARIABLES_QUERY });
        const envVar = data.environmentVariables.find((v) => v.key === key);

        if (!envVar) {
          throw new ArgError(
            sprint`
              Environment variable not found: ${key}
            `,
            { usageHint: false },
          );
        }

        if (envVar.isSecret) {
          throw new ArgError(
            sprint`
              ${key} is a secret and its value cannot be read
            `,
            { usageHint: false },
          );
        }

        println(envVar.value ?? "");
      },
    }),
    set: sub({
      description: "Set one or more environment variables",
      details: sprint`
        Accepts one or more ${colors.hint("KEY=value")} pairs. The value is everything after the
        first ${colors.hint("=")}, so values can contain additional ${colors.hint("=")} characters. Use
        ${colors.hint("--secret")} to mark the variables as write-only.
      `,
      examples: [
        "ggt var set API_KEY=abc123",
        "ggt var set SECRET=xyz --secret",
        "ggt var set KEY1=a KEY2=b",
        "ggt var set CONNECTION_STRING=postgres://user:pass@host/db",
      ],
      positionals: [
        {
          name: "key=value",
          required: true,
          description: "One or more key=value pairs",
          details:
            "The value is everything after the first =, so values can contain = characters. Multiple pairs can be passed in a single invocation.",
        },
      ],
      args: setArgs,
      run: async (ctx, args) => {
        const appIdentity = await resolveAppIdentity(ctx, args);

        const pairs = args._;
        const isSecret = args["--secret"] ?? false;

        const parsed: { key: string; value: string }[] = [];
        for (const pair of pairs) {
          const eqIndex = pair.indexOf("=");
          if (eqIndex === -1) {
            throw new ArgError(
              sprint`
                Invalid format: ${pair}

                Expected format: KEY=value
              `,
              { usageHint: false },
            );
          }
          const key = pair.slice(0, eqIndex);
          if (!key) {
            throw new ArgError(
              sprint`
                Invalid format: ${pair}

                Expected format: KEY=value
              `,
              { usageHint: false },
            );
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
      },
    }),
    delete: sub({
      description: "Delete one or more environment variables",
      details: sprint`
        Prompts for confirmation before deleting unless ${colors.hint("--force")} is passed. Use
        ${colors.hint("--all")} to delete every variable in the environment. With ${colors.hint("--force")},
        missing keys are silently ignored instead of causing an error.
      `,
      examples: ["ggt var delete API_KEY", "ggt var delete KEY1 KEY2", "ggt var delete --all --force"],
      positionals: [
        {
          name: "key",
          description: "Variable name(s) to delete",
          details: "One or more keys separated by spaces. Use --all to delete every variable.",
        },
      ],
      args: deleteArgs,
      run: async (ctx, args) => {
        const appIdentity = await resolveAppIdentity(ctx, args);

        const keys = args._;
        const force = args["--force"] ?? false;
        const all = args["--all"] ?? false;

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

                ${keysToDelete.map((k) => `• ${k}`).join("\n")}
            `;
            await confirm("Are you sure you want to delete all environment variables?");
          }
        } else {
          if (keys.length === 0) {
            throw new ArgError("Missing required argument: key", { usageHint: false });
          }

          keysToDelete = keys;

          if (!force) {
            await confirm(`Are you sure you want to delete ${keysToDelete.join(", ")}?`);
          }
        }

        const deleted: string[] = [];
        for (const key of keysToDelete) {
          try {
            await appIdentity.edit.mutate({
              mutation: DELETE_ENVIRONMENT_VARIABLE_MUTATION,
              variables: { key },
            });
            deleted.push(key);
          } catch (error) {
            const isNotFound =
              error instanceof ClientError &&
              Array.isArray(error.cause) &&
              error.cause.every(
                (e: unknown) => typeof e === "object" && e !== null && "message" in e && /not found/i.test(String(e.message)),
              );

            if (force && isNotFound) {
              // suppress not-found errors when --force is used
              continue;
            }
            throw error;
          }
        }

        if (deleted.length > 0) {
          println(`${symbol.tick} Deleted ${deleted.join(", ")}`);
        }
      },
    }),
    import: sub({
      description: "Import variables from another environment or file",
      details: sprint`
        Requires either ${colors.hint("--from")} (another environment) or ${colors.hint("--from-file")} (a
        ${colors.hint(".env")} file) as the source. By default, variables are imported as
        placeholders with empty values — pass ${colors.hint("--include-values")} to copy the
        actual values. Secret values cannot be copied between environments.
      `,
      examples: [
        "ggt var import --from staging --all",
        "ggt var import --from staging API_KEY DATABASE_URL",
        "ggt var import --from staging --include-values API_KEY",
        "ggt var import --from-file .env --all",
      ],
      positionals: [
        {
          name: "key",
          description: "Variable name(s) to import (or use --all)",
          details: "One or more keys to import. Use --all to import every variable from the source.",
        },
      ],
      args: importArgs,
      run: async (ctx, args) => {
        const appIdentity = await resolveAppIdentity(ctx, args);

        const from = args["--from"];
        const fromFile = args["--from-file"];
        const includeValues = args["--include-values"] ?? false;
        const all = args["--all"] ?? false;
        const specifiedKeys = args._;

        if (!from && !fromFile) {
          throw new ArgError("Either --from or --from-file is required.", { usageHint: false });
        }

        if (from && fromFile) {
          throw new ArgError("Cannot use both --from and --from-file.", { usageHint: false });
        }

        if (!all && specifiedKeys.length === 0) {
          throw new ArgError("Specify keys to import or use --all to import all variables.", { usageHint: false });
        }

        if (from) {
          await importFromEnvironment(ctx, appIdentity, from, specifiedKeys, all, includeValues);
        } else if (fromFile) {
          await importFromFile(appIdentity, fromFile, specifiedKeys, all);
        }
      },
    }),
  }),
});
