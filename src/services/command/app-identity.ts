import fs from "fs-extra";

import type { Directory } from "../filesync/directory.js";
import type { Command } from "./command.js";
import type { Context } from "./context.js";

import { Application, EnvironmentType, getApplications, groupByTeam, type Environment } from "../app/app.js";
import { AppArg } from "../app/arg.js";
import { Edit } from "../app/edit/edit.js";
import { SyncJsonState } from "../filesync/sync-json-state.js";
import { select } from "../output/select.js";
import { setSentryTags } from "../output/sentry.js";
import { sprint } from "../output/sprint.js";
import { getUserOrLogin } from "../user/user.js";
import { sortBySimilar } from "../util/collection.js";
import { ArgError, type ArgsDefinition, type ArgsDefinitionResult } from "./arg.js";

export const AppIdentityArgs = {
  "--app": { type: AppArg, alias: ["-a", "--application"], description: "Select the application" },
  "--env": { type: String, alias: ["-e", "--environment"], description: "Select the environment" },
} satisfies ArgsDefinition;

export type AppIdentityArgs = typeof AppIdentityArgs;
export type AppIdentityArgsResult = ArgsDefinitionResult<AppIdentityArgs>;

/**
 * An object that knows what app and environment we are working with.
 */
export class AppIdentity {
  /**
   * The {@linkcode Edit} client that can be used to send Gadget API
   * requests to the environment that the directory is synced to.
   */
  readonly edit: Edit;

  private constructor(
    /**
     * The {@linkcode Context} that was used to initialize this
     * {@linkcode AppIdentity} instance.
     */
    readonly ctx: Context,

    /**
     * The parsed {@linkcode AppIdentityArgs} that the user passed to ggt.
     */
    readonly args: AppIdentityArgsResult,

    /**
     * The {@linkcode Environment} we are working with.
     */
    readonly environment: Environment,

    /**
     * The state of the `.gadget/sync.json` file on the local
     * filesystem, if found.
     */
    readonly syncJsonState?: SyncJsonState,
  ) {
    this.ctx = ctx.child({ name: "app-identity" });

    this.edit = new Edit(this.ctx, this.environment);
  }

  /**
   * Loads a {@linkcode AppIdentity} from the specified directory, or using the command line args. Always returns an identity by using the given input, or by asking the user if not enough information is provided.
   *
   * - Ensures a user is logged in.
   * - Ensures the user has at least one application.
   * - Uses the app/env from the local .gadget/sync.json file if it exists
   * - Uses the app/env from the command line args if provided
   * - Asks the user to select an app/env if not enough information is provided
   */
  static async load(
    ctx: Context,
    { command, args, directory }: { command: Command; args: AppIdentityArgsResult; directory: Directory },
  ): Promise<AppIdentity> {
    ctx = ctx.child({ name: "app-identity" });

    const user = await getUserOrLogin(ctx, command);
    const availableApps = await getApplications(ctx);
    if (availableApps.length === 0) {
      throw new ArgError(
        sprint`
          You (${user.email}) don't have have any Gadget applications.

          Visit https://gadget.new to create one!
        `,
      );
    }

    // try to load the .gadget/sync.json file
    const syncJsonFile = await fs
      .readFile(directory.absolute(".gadget/sync.json"), "utf8")
      .catch((error: unknown) => ctx.log.warn("failed to read .gadget/sync.json", { error }));
    let state: SyncJsonState | undefined;

    if (syncJsonFile) {
      // the .gadget/sync.json file exists, try to parse it
      try {
        state = SyncJsonState.parse(JSON.parse(syncJsonFile));
      } catch (error) {
        // the .gadget/sync.json file exists, but it's invalid
        ctx.log.warn("failed to parse .gadget/sync.json", { error, syncJsonFile });
      }
    }

    const application = await loadApplication({ args, availableApps, state });
    const environment = await loadEnvironment({ command, args, application, state });

    setSentryTags({
      application_id: application.id,
      environment_id: environment.id,
    });

    return new AppIdentity(ctx, args, environment, state);
  }

  get application(): Application {
    return this.environment.application;
  }
}

const AllowedProdCommands = ["pull", "logs", "eval", "var"] as Command[];

/**
 * Resolves the application from args, sync.json state, or interactive prompt.
 */
export const loadApplication = async ({
  args,
  availableApps,
  state,
  selectPrompt = "Which application do you want to develop?",
}: {
  args: { "--app"?: string };
  availableApps: Application[];
  state?: SyncJsonState;
  selectPrompt?: string;
}): Promise<Application> => {
  let appSlug = args["--app"] || state?.application;
  if (!appSlug) {
    // the user didn't specify an app, ask them to select one
    const groupedChoices: [string, string[]][] = Array.from(groupByTeam(availableApps)).map(([teamName, apps]) => [
      teamName,
      apps.map((app) => app.slug),
    ]);

    appSlug = await select({
      groupedChoices,
      searchable: true,
      content: selectPrompt,
    });
  }

  const application = availableApps.find((app) => app.slug === appSlug);
  if (application) {
    // the user specified an app or we loaded it from the state,
    // and it exists in their list of applications, so return it
    return application;
  }

  // the specified appSlug doesn't exist in their list of apps,
  // either they misspelled it or they don't have access to it
  // anymore, suggest some apps that are similar to the one they
  // specified
  const similarAppSlugs = sortBySimilar(
    appSlug,
    availableApps.map((app) => app.slug),
  ).slice(0, 5);

  // TODO: differentiate between incorrect --app vs state.application?
  throw new ArgError(
    sprint`
      Unknown application:

        ${appSlug}

      Did you mean one of these?

        • ${similarAppSlugs.join("\n        • ")}
    `,
  );
};

const loadEnvironment = async ({
  command,
  args,
  application,
  state,
}: {
  command: Command;
  args: AppIdentityArgsResult;
  application: Application;
  state?: SyncJsonState;
}): Promise<Environment> => {
  const selectableEnvironments = application.environments.filter((env) => env.type === EnvironmentType.Development);
  if (AllowedProdCommands.includes(command)) {
    // allow pulling from production environments
    selectableEnvironments.push(...application.environments.filter((env) => env.type === EnvironmentType.Production));
  }

  let selectedEnvironment = args["--env"] || state?.environment;
  if (!selectedEnvironment) {
    // user didn't specify an environment, ask them to select one
    selectedEnvironment = await select({
      choices: selectableEnvironments.map((env) => env.name),
      content: "Which environment do you want to develop on?",
    });
  }

  if (selectedEnvironment.toLowerCase() === "production" && !AllowedProdCommands.includes(command)) {
    // specifically call out that they can't dev, push, etc. to prod
    throw new ArgError(
      sprint`
        You cannot "ggt ${command}" your {bold production} environment.
      `,
    );
  }

  const environment = selectableEnvironments.find((env) => env.name === selectedEnvironment.toLowerCase());
  if (environment) {
    // the user specified an environment or we loaded it from the state,
    // and it exists in the app's list of environments, so return it
    return { ...environment, application };
  }

  // the specified env doesn't exist in their list of environments,
  // either they misspelled it or they don't have access to it
  // anymore, suggest some envs that are similar to the one they
  // specified
  const similarEnvironments = sortBySimilar(
    selectedEnvironment,
    selectableEnvironments.map((env) => env.name),
  ).slice(0, 5);

  throw new ArgError(
    sprint`
      Unknown environment:

        ${selectedEnvironment}

      Did you mean one of these?

        • ${similarEnvironments.join("\n        • ")}
    `,
  );
};
