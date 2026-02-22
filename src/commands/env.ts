import fs from "fs-extra";

import type { Run, SubcommandDef } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";
import type { Directory } from "../services/filesync/directory.js";

import { type Application, EnvironmentType, getApplications, type Environment } from "../services/app/app.js";
import { AppArg } from "../services/app/arg.js";
import { Edit } from "../services/app/edit/edit.js";
import { CREATE_ENVIRONMENT_MUTATION, DELETE_ENVIRONMENT_MUTATION, UNPAUSE_ENVIRONMENT_MUTATION } from "../services/app/edit/operation.js";
import { loadApplication } from "../services/command/app-identity.js";
import { ArgError, parseArgs, type ArgsDefinition, type ParseArgsOptions } from "../services/command/arg.js";
import { renderDetailedUsage, renderShortUsage } from "../services/command/usage.js";
import { SyncJsonState } from "../services/filesync/sync-json-state.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { confirm } from "../services/output/confirm.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";
import { printTable } from "../services/output/table.js";
import { getUserOrLogin } from "../services/user/user.js";
import { sortBySimilar } from "../services/util/collection.js";

export const description = "Manage environments";

export const positional = "<command>";

export const examples = [
  "ggt env list --app=myapp",
  "ggt env create staging --app=myapp",
  "ggt env delete staging --force --app=myapp",
  "ggt env use staging",
] as const;

const EnvArgs = {
  "--app": { type: AppArg, alias: ["-a", "--application"], description: "Select the application", valueName: "name" },
} satisfies ArgsDefinition;

export const args = EnvArgs;

export const parseOptions: ParseArgsOptions = { permissive: true };

const createArgs = {
  "--from": { type: String, description: "Clone from a specific environment", valueName: "environment" },
} satisfies ArgsDefinition;

const deleteArgs = {
  "--force": { type: Boolean, alias: "-f", description: "Skip confirmation" },
} satisfies ArgsDefinition;

export const subcommandDefs: readonly SubcommandDef[] = [
  { name: "list", description: "List all environments", examples: ["ggt env list --app=myapp"] },
  {
    name: "create",
    description: "Create a new environment",
    args: createArgs,
    examples: ["ggt env create staging --app=myapp", "ggt env create staging --from=development"],
  },
  { name: "delete", description: "Delete an environment", args: deleteArgs, examples: ["ggt env delete staging --force"] },
  { name: "unpause", description: "Unpause a paused environment", examples: ["ggt env unpause staging"] },
  { name: "use", description: "Switch the active environment", examples: ["ggt env use staging"] },
];

export const run: Run<typeof args> = async (ctx, args) => {
  const subcommandAliases: Record<string, string> = { ls: "list" };
  let subcommand = args._.shift();
  if (subcommand) {
    subcommand = subcommandAliases[subcommand] ?? subcommand;
  }

  // handle -h/--help for subcommand-specific help
  if (args._.includes("-h") || args._.includes("--help")) {
    if (subcommand) {
      const def = subcommandDefs.find((d) => d.name === subcommand);
      if (def) {
        println(
          renderShortUsage("env " + subcommand, {
            description: def.description,
            args: { ...EnvArgs, ...def.args },
            examples: def.examples ?? [],
          }),
        );
        process.exit(0);
      }
    }
    const mod = await import("./env.js");
    println(renderDetailedUsage("env", mod));
    process.exit(0);
  }

  if (!subcommand) {
    const mod = await import("./env.js");
    println(renderDetailedUsage("env", mod));
    return;
  }

  if (!subcommandDefs.some((d) => d.name === subcommand)) {
    throw new ArgError(sprint`
      Unknown subcommand {yellow ${subcommand}}

      Run {gray ggt env -h} for usage
    `);
  }

  const application = await resolveApplication(ctx, args);

  switch (subcommand) {
    case "list":
      runList(application);
      break;
    case "create":
      await runCreate(ctx, application, args._);
      break;
    case "delete":
      await runDelete(ctx, application, args._);
      break;
    case "unpause":
      await runUnpause(ctx, application, args._);
      break;
    case "use":
      await runUse(ctx, application, args._);
      break;
  }
};

const resolveApplication = async (ctx: Context, args: { "--app"?: string; _: string[] }): Promise<Application> => {
  const user = await getUserOrLogin(ctx, "env");
  const availableApps = await getApplications(ctx);

  if (availableApps.length === 0) {
    throw new ArgError(
      sprint`
        You (${user.email}) don't have any Gadget applications.

        Visit https://gadget.new to create one!
      `,
    );
  }

  // try reading sync.json state for the app slug fallback
  let state: SyncJsonState | undefined;
  if (!args["--app"]) {
    try {
      const directory = await loadSyncJsonDirectory(process.cwd());
      const syncJsonFile = await fs.readFile(directory.absolute(".gadget/sync.json"), "utf8");
      state = SyncJsonState.parse(JSON.parse(syncJsonFile));
    } catch {
      // no sync.json found or invalid, that's ok
    }
  }

  return loadApplication({
    args,
    availableApps,
    state,
    selectPrompt: "Which application do you want to manage environments for?",
  });
};

const findEnvironmentOrThrow = (application: Application, name: string): Environment => {
  const environment = application.environments.find((env) => env.name === name.toLowerCase());
  if (environment) {
    return { ...environment, application };
  }

  const similarEnvs = sortBySimilar(
    name,
    application.environments.map((env) => env.name),
  ).slice(0, 5);

  throw new ArgError(sprint`
    Unknown environment: ${name}

    Did you mean one of these?

      • ${similarEnvs.join("\n        • ")}
  `);
};

const getEditForApp = (ctx: Context, application: Application, targetEnv?: Environment): Edit => {
  const environment = targetEnv ?? application.environments.find((env) => env.type === EnvironmentType.Development);

  if (!environment) {
    throw new ArgError(
      sprint`
        No development environment found for ${application.slug}.
      `,
    );
  }

  return new Edit(ctx, { ...environment, application });
};

const runList = (application: Application): void => {
  const envs = application.environments;

  if (envs.length === 0) {
    println("No environments found.");
    return;
  }

  printTable({
    headers: ["Name", "Type"],
    rows: envs.map((env) => [env.name, env.type]),
  });
};

const runCreate = async (ctx: Context, application: Application, positional: string[]): Promise<void> => {
  const subArgs = parseArgs(createArgs, { argv: positional });
  const name = subArgs._.shift();
  const from = subArgs["--from"];

  if (!name) {
    throw new ArgError(sprint`
      Missing required argument: name

      Run {gray ggt env create -h} for usage
    `);
  }

  const edit = getEditForApp(ctx, application);
  try {
    await edit.mutate({
      mutation: CREATE_ENVIRONMENT_MUTATION,
      variables: { environment: { slug: name, sourceSlug: from } },
    });

    println(`${symbol.tick} Created environment ${name}`);
  } finally {
    await edit.dispose();
  }
};

const runDelete = async (ctx: Context, application: Application, positional: string[]): Promise<void> => {
  const subArgs = parseArgs(deleteArgs, { argv: positional });
  const name = subArgs._.shift();
  const force = subArgs["--force"] ?? false;

  if (!name) {
    throw new ArgError(sprint`
      Missing required argument: name

      Run {gray ggt env delete -h} for usage
    `);
  }

  const environment = findEnvironmentOrThrow(application, name);

  if (environment.type === EnvironmentType.Production) {
    throw new ArgError(sprint`
      Cannot delete the {bold production} environment.
    `);
  }

  if (!force) {
    await confirm(`Are you sure you want to delete the ${environment.name} environment?`);
  }

  const edit = getEditForApp(ctx, application);
  try {
    await edit.mutate({
      mutation: DELETE_ENVIRONMENT_MUTATION,
      variables: { slug: environment.name },
    });

    println(`${symbol.tick} Deleted environment ${environment.name}`);
  } finally {
    await edit.dispose();
  }
};

const runUnpause = async (ctx: Context, application: Application, positional: string[]): Promise<void> => {
  const name = positional.shift();

  if (!name) {
    throw new ArgError(sprint`
      Missing required argument: name

      Run {gray ggt env unpause -h} for usage
    `);
  }

  const environment = findEnvironmentOrThrow(application, name);

  const edit = getEditForApp(ctx, application, environment);
  try {
    const data = await edit.mutate({
      mutation: UNPAUSE_ENVIRONMENT_MUTATION,
    });

    if (data.unpauseEnvironment.alreadyActive) {
      println(`Environment ${name} is already active.`);
    } else {
      println(`${symbol.tick} Unpaused environment ${name}`);
    }
  } finally {
    await edit.dispose();
  }
};

const runUse = async (_ctx: Context, application: Application, positional: string[]): Promise<void> => {
  const name = positional.shift();

  if (!name) {
    throw new ArgError(sprint`
      Missing required argument: name

      Run {gray ggt env use -h} for usage
    `);
  }

  const environment = findEnvironmentOrThrow(application, name);

  if (environment.type === EnvironmentType.Production) {
    throw new ArgError(sprint`
      Cannot use the {bold production} environment.

      Use {gray ggt pull --env=production} to pull from production instead.
    `);
  }

  let directory: Directory;
  try {
    directory = await loadSyncJsonDirectory(process.cwd());
  } catch {
    throw new ArgError(sprint`
      No .gadget/sync.json found in this directory or any parent directory.

      Run {gray ggt dev} first to initialize a sync directory.
    `);
  }

  const syncJsonPath = directory.absolute(".gadget/sync.json");

  let state: SyncJsonState;
  try {
    const syncJsonFile = await fs.readFile(syncJsonPath, "utf8");
    state = SyncJsonState.parse(JSON.parse(syncJsonFile));
  } catch {
    throw new ArgError(sprint`
      No .gadget/sync.json found in this directory or any parent directory.

      Run {gray ggt dev} first to initialize a sync directory.
    `);
  }

  if (state.application !== application.slug) {
    throw new ArgError(sprint`
      This directory is synced to {yellow ${state.application}}, but you specified {yellow ${application.slug}}.

      Either run this command from a directory synced to ${application.slug}, or omit the {gray --app} flag.
    `);
  }

  if (state.environment === environment.name) {
    println(`Already on environment ${environment.name}.`);
    return;
  }

  const previousEnv = state.environment;
  state.environment = environment.name;
  if (!state.environments[environment.name]) {
    state.environments[environment.name] = { filesVersion: "0" };
  }

  await fs.outputJSON(syncJsonPath, state, { spaces: 2 });

  println(`${symbol.tick} Switched environment: ${previousEnv} → ${environment.name}`);
};
