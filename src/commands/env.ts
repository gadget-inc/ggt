import path from "node:path";

import fs from "fs-extra";

import { type Application, EnvArg, EnvironmentType, getApplications, type Environment } from "../services/app/app.js";
import { Edit } from "../services/app/edit/edit.js";
import { CREATE_ENVIRONMENT_MUTATION, DELETE_ENVIRONMENT_MUTATION, UNPAUSE_ENVIRONMENT_MUTATION } from "../services/app/edit/operation.js";
import { AppIdentityArgs, loadApplication } from "../services/command/app-identity.js";
import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import { defineCommand } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";
import type { Directory } from "../services/filesync/directory.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { SyncJsonState } from "../services/filesync/sync-json-state.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import colors from "../services/output/colors.js";
import { confirm } from "../services/output/confirm.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";
import { printTable } from "../services/output/table.js";
import { getUserOrLogin } from "../services/user/user.js";
import { sortBySimilar } from "../services/util/collection.js";

const parentArgs = {
  "--application": AppIdentityArgs["--application"],
} satisfies ArgsDefinition;

const resolveApplication = async (
  ctx: Context,
  args: { "--application"?: string },
): Promise<{ application: Application; state?: SyncJsonState }> => {
  const user = await getUserOrLogin(ctx, "env");
  const availableApps = await getApplications(ctx);

  if (availableApps.length === 0) {
    throw new ArgError(
      sprint`
        You (${user.email}) don't have any Gadget applications.

        Visit https://gadget.new to create one!
      `,
      { usageHint: false },
    );
  }

  // try reading sync.json state for the app slug fallback and environment context
  let state: SyncJsonState | undefined;
  try {
    const directory = await loadSyncJsonDirectory(process.cwd());
    const syncJsonFile = await fs.readFile(directory.absolute(".gadget/sync.json"), "utf8");
    state = SyncJsonState.parse(JSON.parse(syncJsonFile));
  } catch {
    // no sync.json found or invalid, that's ok
  }

  const application = await loadApplication({
    args,
    availableApps,
    state,
    selectPrompt: "Which application do you want to manage environments for?",
  });

  return { application, state };
};

const findEnvironmentOrThrow = (application: Application, name: string): Environment => {
  const environment = application.environments.find((env) => env.name === name.toLowerCase());
  if (environment) {
    return { ...environment, application };
  }

  if (application.environments.length === 0) {
    throw new ArgError(
      sprint`
        No environments found for ${application.slug}.
      `,
      { usageHint: false },
    );
  }

  const similarEnvs = sortBySimilar(
    name,
    application.environments.map((env) => env.name),
  ).slice(0, 5);

  throw new ArgError(
    sprint`
      Unknown environment: ${name}

      Did you mean one of these?

        ${similarEnvs.map((s) => `• ${s}`).join("\n")}
    `,
    { usageHint: false },
  );
};

const getEditForApp = (ctx: Context, application: Application, targetEnv?: Environment): Edit => {
  const environment = targetEnv ?? application.environments.find((env) => env.type === EnvironmentType.Development);

  if (!environment) {
    throw new ArgError(`No development environment found for ${application.slug}.`, { usageHint: false });
  }

  return new Edit(ctx, { ...environment, application });
};

const activateEnvironment = async (application: Application, envName: string): Promise<void> => {
  let directory: Directory | undefined;
  try {
    directory = await loadSyncJsonDirectory(process.cwd());
  } catch (e) {
    if (!(e instanceof UnknownDirectoryError)) throw e;
    // no sync.json directory found, we'll create one
  }

  if (directory) {
    const syncJsonPath = directory.absolute(".gadget/sync.json");
    let syncJsonFile: string | undefined;
    try {
      syncJsonFile = await fs.readFile(syncJsonPath, "utf8");
    } catch {
      // sync.json file doesn't exist, we'll create one
    }

    if (syncJsonFile) {
      const state = SyncJsonState.parse(JSON.parse(syncJsonFile));

      if (state.application !== application.slug) {
        throw new ArgError(
          sprint`
          This directory is synced to ${colors.warning(state.application)}, but you specified ${colors.warning(application.slug)}.

          Either run this command from a directory synced to ${application.slug}, or omit the ${colors.subdued("--app")} flag.
        `,
          { usageHint: false },
        );
      }

      if (state.environment === envName) {
        println(`Already on environment ${envName}.`);
        return;
      }

      const previousEnv = state.environment;
      state.environment = envName;
      if (!state.environments[envName]) {
        state.environments[envName] = { filesVersion: "0" };
      }

      await fs.outputJSON(syncJsonPath, state, { spaces: 2 });
      println(`${symbol.tick} Switched environment: ${previousEnv} → ${envName}`);
      return;
    }
  }

  // No sync.json found — create a new one in the sync root (or cwd if no sync root)
  const newSyncJsonPath = directory ? directory.absolute(".gadget/sync.json") : path.join(process.cwd(), ".gadget", "sync.json");
  const newState: SyncJsonState = {
    application: application.slug,
    environment: envName,
    environments: { [envName]: { filesVersion: "0" } },
  };
  await fs.outputJSON(newSyncJsonPath, newState, { spaces: 2 });
  println(`${symbol.tick} Activated environment ${envName}`);
};

export default defineCommand({
  name: "env",
  aliases: ["envs"],
  description: "Manage your app's environments",
  details: sprint`
    Environments are isolated copies of your app for development, staging, and testing. Each
    environment has its own database, file tree, and environment variables. The production
    environment cannot be deleted or used directly with ggt dev.
  `,
  examples: [
    "ggt env list",
    "ggt env create staging",
    "ggt env create staging --from development",
    "ggt env delete staging --force",
    "ggt env unpause staging",
    "ggt env use staging",
  ],
  args: parentArgs,
  subcommands: (sub) => ({
    list: sub({
      aliases: ["ls"],
      description: "List all environments",
      details: sprint`
        Displays a table of all environments with their names and types. Returns
        a "no environments found" message if the app has none.
      `,
      examples: ["ggt env list", "ggt env list --app myapp"],
      run: async (ctx, args) => {
        const { application } = await resolveApplication(ctx, args);
        const envs = application.environments;

        if (envs.length === 0) {
          println("No environments found.");
          return;
        }

        printTable({
          headers: ["Name", "Type"],
          rows: envs.map((env) => [env.name, env.type]),
        });
      },
    }),
    create: sub({
      description: "Create a new environment",
      details: sprint`
        The environment name is lowercased automatically. Use ${colors.subdued("--from")} to clone an
        existing environment's data and schema; if omitted, the current environment
        is used as the source. Use ${colors.subdued("--use")} to switch your local directory to the
        new environment immediately after creation.

        See also: ${colors.subdued("ggt add environment")} for a simpler shorthand that clones
        the current environment and auto-switches.
      `,
      examples: ["ggt env create staging", "ggt env create staging --from development", "ggt env create my-feature --use"],
      positionals: [
        {
          name: "name",
          required: true,
          description: "New environment name",
          details: "The name is lowercased automatically. Must be unique within the app.",
        },
      ],
      args: {
        "--from": {
          ...EnvArg,
          alias: [],
          description: "Clone from an existing environment",
          details: "Clones the source environment's data and schema. If omitted, the current environment is used as the source.",
        },
        "--use": {
          type: Boolean,
          alias: "-u",
          description: "Switch to the new environment after creation",
          details: "Updates .gadget/sync.json to point at the new environment so subsequent commands target it.",
        },
      },
      run: async (ctx, args) => {
        const { application, state } = await resolveApplication(ctx, args);
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const rawName = args._[0]!;
        // Use the explicit --from flag if provided, otherwise fall back to the currently
        // active environment when the app matches (so `env create` inherits context naturally).
        const from = (args["--from"] ?? (state?.application === application.slug ? state.environment : undefined))?.toLowerCase();
        const use = args["--use"] ?? false;

        const name = rawName.toLowerCase();

        // Validate --use before creating the environment to avoid creating an
        // environment on the server that can't be activated locally
        if (use && state?.application && state.application !== application.slug) {
          throw new ArgError(
            sprint`
              Cannot use ${colors.subdued("--use")}: this directory is synced to ${colors.warning(state.application)}, but you specified ${colors.warning(application.slug)}.

              Either run this command from a directory synced to ${application.slug}, or omit the ${colors.subdued("--app")} flag.
            `,
            { usageHint: false },
          );
        }

        const edit = getEditForApp(ctx, application);
        try {
          await edit.mutate({
            mutation: CREATE_ENVIRONMENT_MUTATION,
            variables: { environment: { slug: name, ...(from && { sourceSlug: from }) } },
          });

          println(`${symbol.tick} Created environment ${name}`);
        } finally {
          await edit.dispose();
        }

        if (use) {
          await activateEnvironment(application, name);
        }
      },
    }),
    delete: sub({
      description: "Delete an environment",
      details: sprint`
        Prompts for confirmation before deleting unless ${colors.subdued("--force")} is passed. The
        production environment cannot be deleted. If your sync directory was using
        the deleted environment, you'll need to switch to another with
        ${colors.identifier("ggt env use")}.
      `,
      examples: ["ggt env delete staging", "ggt env delete staging --force"],
      positionals: [
        {
          name: "name",
          required: true,
          description: "Environment name",
          details: "The production environment cannot be deleted.",
        },
      ],
      args: {
        "--force": {
          type: Boolean,
          alias: "-f",
          description: "Skip confirmation",
          details: "Deletes the environment immediately without a confirmation prompt.",
        },
      },
      run: async (ctx, args) => {
        const { application, state } = await resolveApplication(ctx, args);
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const name = args._[0]!;

        const environment = findEnvironmentOrThrow(application, name);

        if (environment.type === EnvironmentType.Production) {
          throw new ArgError(
            sprint`
              Cannot delete the ${colors.identifier("production")} environment.
            `,
            { usageHint: false },
          );
        }

        if (!args["--force"]) {
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

        if (state?.application === application.slug && state.environment === environment.name) {
          println(sprint`
            ${colors.warning("Warning:")} your sync directory was using the ${environment.name} environment.

            Run ${colors.subdued("ggt env use <environment>")} to switch to another environment.
          `);
        }
      },
    }),
    unpause: sub({
      description: "Unpause a paused environment",
      details: sprint`
        Environments are paused automatically after a period of inactivity.
        This command resumes a paused environment so it can serve requests and
        run actions again. Prints a message if the environment is already
        active.
      `,
      examples: ["ggt env unpause staging", "ggt env unpause development --app myapp"],
      positionals: [
        {
          name: "name",
          required: true,
          description: "Environment name",
          details: "Must match an existing environment in the app.",
        },
      ],
      run: async (ctx, args) => {
        const { application } = await resolveApplication(ctx, args);
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const name = args._[0]!;

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
      },
    }),
    use: sub({
      description: "Switch the active environment for this directory",
      details: sprint`
        Updates ${colors.subdued(".gadget/sync.json")} to point at the given environment. The
        production environment cannot be set as the active sync target — use
        ${colors.identifier("ggt pull --env production")} to pull production files instead.
      `,
      examples: ["ggt env use staging", "ggt env use development"],
      positionals: [
        {
          name: "name",
          required: true,
          description: "Environment name",
          details: "The production environment cannot be set as the active sync target.",
        },
      ],
      run: async (ctx, args) => {
        const { application } = await resolveApplication(ctx, args);
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const name = args._[0]!;

        const environment = findEnvironmentOrThrow(application, name);

        if (environment.type === EnvironmentType.Production) {
          throw new ArgError(
            sprint`
              Cannot use the ${colors.identifier("production")} environment.

              Use ${colors.subdued("ggt pull --env production")} to pull from production instead.
            `,
            { usageHint: false },
          );
        }

        await activateEnvironment(application, environment.name);
      },
    }),
  }),
});
