import { findUp } from "find-up";
import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import { simpleGit } from "simple-git";
import terminalLink from "terminal-link";
import { z } from "zod";

import type { Command } from "../command/command.js";
import type { Context } from "../command/context.js";

import { EnvironmentType, getApplications, groupByTeam, type Application, type Environment } from "../app/app.js";
import { AppArg } from "../app/arg.js";
import { Edit } from "../app/edit/edit.js";
import { ArgError, type ArgsDefinition, type ArgsDefinitionResult } from "../command/arg.js";
import { config, homePath } from "../config/config.js";
import colors from "../output/colors.js";
import { println } from "../output/print.js";
import { select } from "../output/select.js";
import { setSentryTags } from "../output/sentry.js";
import { sprint, sprintln, type SprintOptions } from "../output/sprint.js";
import { getUserOrLogin } from "../user/user.js";
import { sortBySimilar } from "../util/collection.js";
import { defaults } from "../util/object.js";
import { Directory } from "./directory.js";
import { UnknownDirectoryError } from "./error.js";

export const SyncJsonArgs = {
  "--app": { type: AppArg, alias: ["-a", "--application"] },
  "--env": { type: String, alias: ["-e", "--environment"] },
  "--allow-unknown-directory": Boolean,
  "--allow-different-app": Boolean,
} satisfies ArgsDefinition;

export type SyncJsonArgs = typeof SyncJsonArgs;
export type SyncJsonArgsResult = ArgsDefinitionResult<SyncJsonArgs>;

/**
 * The state of the filesystem.
 *
 * This is persisted to `.gadget/sync.json` within the {@linkcode directory}.
 */
// TODO: rename and/or add to ctx?
export class SyncJson {
  /**
   * The last git branch that was checked out in the directory.
   */
  gitBranch: string | undefined;

  /**
   * The {@linkcode Edit} client that can be used to send Gadget API
   * requests to the environment that the directory is synced to.
   */
  readonly edit: Edit;

  private constructor(
    /**
     * The {@linkcode Context} that was used to initialize this
     * {@linkcode SyncJson} instance.
     */
    readonly ctx: Context,

    /**
     * The parsed {@linkcode SyncJsonArgs} that the user passed to ggt.
     */
    readonly args: SyncJsonArgsResult,

    /**
     * The root directory of the local filesystem, or in other words,
     * the directory that contains the `.gadget/sync.json` file.
     */
    readonly directory: Directory,

    /**
     * The {@linkcode Environment} the directory is synced to.
     */
    readonly environment: Environment,

    /**
     * The name of the environment the directory was synced to before
     * it was synced to the current environment.
     *
     * This is undefined if the environment didn't change.
     */
    readonly previousEnvironment: string | undefined,

    /**
     * The state of the `.gadget/sync.json` file on the local
     * filesystem.
     */
    readonly state: SyncJsonState,
  ) {
    this.ctx = ctx.child({
      name: "sync-json",
      fields: () => ({
        syncJson: {
          directory: this.directory.path,
          branch: this.gitBranch,
          ...this.state,
        },
      }),
    });

    this.edit = new Edit(this.ctx, this.environment);
  }

  /**
   * The last filesVersion that was written to the filesystem.
   *
   * This determines if the filesystem in Gadget is ahead of the
   * filesystem on the local machine.
   */
  get filesVersion(): bigint {
    const environment = this.state.environments[this.state.environment];
    assert(environment, "environment must exist in environments");
    return BigInt(environment.filesVersion);
  }

  /**
   * Loads a {@linkcode SyncJson} from the specified directory.
   *
   * Returns undefined if the directory doesn't exist, is empty, or
   * doesn't contain a `.gadget/sync.json` file.
   */
  static async load(
    ctx: Context,
    { command, args, directory }: { command: Command; args: SyncJsonArgsResult; directory: Directory },
  ): Promise<SyncJson | undefined> {
    ctx = ctx.child({ name: "sync-json" });

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

    if (!syncJsonFile) {
      // the .gadget/sync.json file doesn't exist in the directory
      // or any of its parents
      return undefined;
    }

    // the .gadget/sync.json file exists, try to parse it
    let state: SyncJsonState | undefined;
    try {
      state = SyncJsonState.parse(JSON.parse(syncJsonFile));
    } catch (error) {
      // the .gadget/sync.json file exists, but it's invalid
      ctx.log.warn("failed to parse .gadget/sync.json", { error, syncJsonFile });
      return undefined;
    }

    const application = await loadApplication({ args, availableApps, state });
    const environment = await loadEnvironment({ command, args, application, state });

    setSentryTags({
      application_id: application.id,
      environment_id: environment.id,
    });

    if (state.application !== application.slug) {
      // .gadget/sync.json is associated with a different app
      if (args["--allow-different-app"]) {
        // the user passed --allow-different-app, so use the application
        // and environment they specified and clobber everything
        const state = {
          application: application.slug,
          environment: environment.name,
          environments: {
            [environment.name]: { filesVersion: "0" },
          },
        };

        const syncJson =
          environment.type === "production"
            ? new EphemeralSyncJson(ctx, args, directory, environment, undefined, state)
            : new SyncJson(ctx, args, directory, environment, undefined, state);

        await syncJson.loadGitBranch();
        return syncJson;
      }

      // the user didn't pass --allow-different-app, so throw an error
      throw new ArgError(sprint`
          You were about to sync the following app to the following directory:

              ${application.slug} (${environment.name}) → ${directory.path}

          However, that directory has already been synced with this app:

              ${state.application} (${state.environment})

          If you're sure that you want to sync:

              ${application.slug} (${environment.name}) → ${directory.path}

          Run "ggt dev" with the {bold --allow-different-app} flag.
      `);
    }

    let previousEnvironment: string | undefined;
    if (state.environment !== environment.name) {
      // the user specified a different environment

      if (environment.type !== "production") {
        // the new environment isn't a production environment, so let
        // the user know that we're changing environments (we're not
        // using the EphemeralSyncJson class)
        println({
          ensureEmptyLineAbove: true,
          content: sprint`
          Changing environment.

            ${state.environment} → ${environment.name}
        `,
        });
      }

      // update the state to the new environment
      previousEnvironment = state.environment;
      state.environment = environment.name;
      if (!state.environments[environment.name]) {
        // the user has never synced to this environment before
        state.environments[environment.name] = { filesVersion: "0" };
      }
    }

    const syncJson =
      environment.type === "production"
        ? new EphemeralSyncJson(ctx, args, directory, environment, previousEnvironment, state)
        : new SyncJson(ctx, args, directory, environment, previousEnvironment, state);

    await syncJson.save(syncJson.filesVersion);
    await syncJson.loadGitBranch();
    return syncJson;
  }

  /**
   * Loads a {@linkcode SyncJson} from the specified directory or
   * initializes a new one.
   *
   * - Ensures a user is logged in.
   * - Ensures the user has at least one application.
   * - Ensures the directory exists.
   * - Ensures the directory is empty or contains a `.gadget/sync.json` file, unless --allow-unknown-directory was passed
   * - Ensures the specified app matches the app the directory previously synced to, unless --allow-different-app was passed
   */
  // TODO: rename to loadOrAskAndInit
  static async loadOrInit(
    ctx: Context,
    { command, args, directory }: { command: Command; args: SyncJsonArgsResult; directory: Directory },
  ): Promise<SyncJson> {
    ctx = ctx.child({ name: "sync-json" });

    let syncJson = await SyncJson.load(ctx, { command, args, directory });
    if (syncJson) {
      // the .gadget/sync.json file already exists and is valid
      return syncJson;
    }

    if ((await directory.hasFiles()) && !args["--allow-unknown-directory"]) {
      // the directory isn't empty and the user didn't pass --allow-unknown-directory
      throw new UnknownDirectoryError({ command, args, directory });
    }

    const application = await loadApplication({ args, availableApps: await getApplications(ctx) });
    const environment = await loadEnvironment({ command, args, application });

    // the directory is empty or the user passed
    // --allow-unknown-directory, either way ensure the directory exists
    // and create a fresh .gadget/sync.json file
    await fs.ensureDir(directory.path);

    const state = {
      application: application.slug,
      environment: environment.name,
      environments: {
        [environment.name]: { filesVersion: "0" },
      },
    };

    syncJson =
      environment.type === "production"
        ? new EphemeralSyncJson(ctx, args, directory, environment, undefined, state)
        : new SyncJson(ctx, args, directory, environment, undefined, state);

    await syncJson.save(syncJson.filesVersion);
    await syncJson.loadGitBranch();

    return syncJson;
  }

  /**
   * Updates {@linkcode state} and saves it to `.gadget/sync.json`.
   */
  async save(filesVersion: string | bigint): Promise<void> {
    const environment = this.state.environments[this.state.environment];
    assert(environment, "environment must exist in environments");
    environment.filesVersion = String(filesVersion);

    this.ctx.log.debug("saving .gadget/sync.json");
    await fs.outputJSON(this.directory.absolute(".gadget/sync.json"), this.state, { spaces: 2 });
  }

  async loadGitBranch(): Promise<void> {
    this.gitBranch = await loadBranch(this.ctx, { directory: this.directory });
  }

  sprint(options: SprintOptions = {}): string {
    let content = sprintln`
      Application  ${this.environment.application.slug}
      Environment  ${this.environment.name}
    `;

    if (this.gitBranch) {
      content += sprintln({ indent: 5, content: `Branch  ${this.gitBranch}` });
    }

    const domain = config.domains.app;

    if (terminalLink.isSupported) {
      content += sprintln({
        ensureEmptyLineAbove: true,
        content: `${terminalLink(colors.link("Preview"), `https://${this.environment.application.slug}--${this.environment.name}.${domain}`)}  ${terminalLink(colors.link("Editor"), `https://${this.environment.application.primaryDomain}/edit/${this.environment.name}`)}  ${terminalLink(colors.link("Playground"), `https://${this.environment.application.primaryDomain}/api/playground/javascript?environment=${this.environment.name}`)}  ${terminalLink(colors.link("Docs"), `https://docs.gadget.dev/api/${this.environment.application.slug}`)}`,
      });
    } else {
      content += sprintln`
          ------------------------
           Preview     https://${this.environment.application.slug}--${this.environment.name}.${domain}
           Editor      https://${this.environment.application.primaryDomain}/edit/${this.environment.name}
           Playground  https://${this.environment.application.primaryDomain}/api/playground/javascript?environment=${this.environment.name}
           Docs        https://docs.gadget.dev/api/${this.environment.application.slug}
      `;
    }

    return sprintln({ ...options, content });
  }

  print(options?: SprintOptions): void {
    options = defaults(options, { ensureEmptyLineAbove: true });
    println(this.sprint(options));
  }
}

/**
 * A {@linkcode SyncJson} that doesn't save its state to the filesystem.
 *
 * This is used when the user runs ggt pull --env=production so that we
 * don't change the .gadget/sync.json file to point to the production
 * environment, causing failures when they try to dev, push, etc.
 */
// @ts-expect-error SyncJson's constructor is private
export class EphemeralSyncJson extends SyncJson {
  override async save(filesVersion: string | bigint): Promise<void> {
    const environment = this.state.environments[this.state.environment];
    assert(environment, "environment must exist in environments");
    environment.filesVersion = String(filesVersion);

    // don't save the state to the filesystem
    return Promise.resolve();
  }
}

export const loadSyncJsonDirectory = async (dir: string): Promise<Directory> => {
  if (config.windows && dir.startsWith("~/")) {
    // "~" doesn't expand to the home directory on Windows
    dir = homePath(dir.slice(2));
  }

  // TODO: rename to .gadget/ggt.json
  const syncJsonPath = await findUp(".gadget/sync.json", { cwd: dir });
  if (syncJsonPath) {
    // we found a .gadget/sync.json file, use its parent directory
    dir = path.join(syncJsonPath, "../..");
  }

  // ensure the directory path is absolute
  dir = path.resolve(dir);

  return await Directory.init(dir);
};

// ensure the selected app is valid
const loadApplication = async ({
  args,
  availableApps,
  state,
}: {
  args: SyncJsonArgsResult;
  availableApps: Application[];
  state?: SyncJsonState;
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
      content: "Which application do you want to develop?",
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

const AllowedProdCommands = ["pull", "logs"] as Command[];

const loadEnvironment = async ({
  command,
  args,
  application,
  state,
}: {
  command: Command;
  args: SyncJsonArgsResult;
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

/**
 * Returns the current git branch of the directory or undefined if
 * the directory isn't a git repository.
 */
const loadBranch = async (ctx: Context, { directory }: { directory: Directory }): Promise<string | undefined> => {
  try {
    const branch = await simpleGit(directory.path).revparse(["--abbrev-ref", "HEAD"]);
    return branch;
  } catch (error) {
    ctx.log.warn("failed to read git branch", { error });
    return undefined;
  }
};

export const SyncJsonStateV1 = z.object({
  application: z.string(),
  environment: z.string(),
  environments: z.record(z.string(), z.object({ filesVersion: z.string() })),
});

export const AnySyncJsonState = SyncJsonStateV1;

export const SyncJsonState = SyncJsonStateV1;

export type SyncJsonStateV1 = z.infer<typeof SyncJsonStateV1>;
export type AnySyncJsonState = z.infer<typeof AnySyncJsonState>;
export type SyncJsonState = z.infer<typeof SyncJsonState>;
