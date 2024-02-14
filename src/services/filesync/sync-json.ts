import { findUp } from "find-up";
import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import { simpleGit } from "simple-git";
import { z } from "zod";
import { EnvironmentType, getApps, type App, type Environment } from "../app/app.js";
import { AppArg } from "../app/arg.js";
import { Edit } from "../app/edit/edit.js";
import { ArgError, type ArgsDefinition } from "../command/arg.js";
import type { Context } from "../command/context.js";
import { config, homePath } from "../config/config.js";
import { select } from "../output/prompt.js";
import { sprint, sprintln2 } from "../output/sprint.js";
import { getUserOrLogin } from "../user/user.js";
import { sortBySimilar } from "../util/collection.js";
import { Directory } from "./directory.js";
import { UnknownDirectoryError } from "./error.js";

export const SyncJsonArgs = {
  "--app": { type: AppArg, alias: ["-a", "--application"] },
  "--env": { type: String, alias: ["-e", "--environment"] },
  "--allow-unknown-directory": Boolean,
  "--allow-different-app": Boolean,
} satisfies ArgsDefinition;

export type SyncJsonArgs = typeof SyncJsonArgs;

/**
 * The state of the filesystem.
 *
 * This is persisted to `.gadget/sync.json` within the {@linkcode directory}.
 */
export class SyncJson {
  /**
   * The {@linkcode App} that the directory is synced to.
   */
  readonly app: App;

  /**
   * The {@linkcode Environment} that the directory is synced to.
   */
  readonly env: Environment;

  /**
   * The last git branch that was checked out in the directory.
   */
  gitBranch: string | undefined;

  /**
   * The {@linkcode Edit} client that can be used to send Gadget API
   * requests to the environment that the directory is synced to.
   */
  readonly edit: Edit;

  /**
   * The last time the `.gadget/sync.json` file was modified.
   *
   * @deprecated
   * We don't use this anymore, it's only here because older versions
   * of ggt expect it to be in the .gadget/sync.json file.
   */
  private _mtime: number | undefined;

  private constructor(
    /**
     * The {@linkcode Context} that was used to initialize this
     * {@linkcode SyncJson} instance.
     */
    readonly ctx: Context<SyncJsonArgs>,

    /**
     * the root directory of the local filesystem, or in other words,
     * the directory that contains the `.gadget/sync.json` file.
     */
    readonly directory: Directory,

    /**
     * Indicates whether the environment was changed when this instance
     * was loaded or initialized.
     */
    readonly previousEnvironment: string | undefined,

    /**
     * The state of the `.gadget/sync.json` file on the local
     * filesystem.
     */
    readonly state: SyncJsonState,
  ) {
    this.ctx = ctx.child({
      fields: () => ({
        syncJson: {
          directory: this.directory.path,
          branch: this.gitBranch,
          ...this.state,
        },
      }),
    });

    assert(this.ctx.app, "app must be set on syncJson context");
    this.app = this.ctx.app;

    assert(this.ctx.env, "env must be set on syncJson context");
    this.env = this.ctx.env;

    this.edit = new Edit(this.ctx);
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
  static async load(ctx: Context<SyncJsonArgs>, { directory }: { directory: Directory }): Promise<SyncJson | undefined> {
    ctx = ctx.child({ name: "sync-json" });

    const user = await getUserOrLogin(ctx);
    const availableApps = await getApps(ctx);
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

    ctx.app = await loadApp(ctx, { availableApps, state });
    ctx.env = await loadEnv(ctx, { app: ctx.app, state });

    if (state.application !== ctx.app.slug) {
      // .gadget/sync.json is associated with a different app
      if (ctx.args["--allow-different-app"]) {
        // the user passed --allow-different-app, so use the application
        // and environment they specified and clobber everything
        return new SyncJson(ctx, directory, undefined, {
          application: ctx.app.slug,
          environment: ctx.env.name,
          environments: {
            [ctx.env.name]: { filesVersion: "0" },
          },
        });
      }

      // the user didn't pass --allow-different-app, so throw an error
      throw new ArgError(sprint`
          You were about to sync the following app to the following directory:

              ${ctx.app.slug} (${ctx.env.name}) → ${directory.path}

          However, that directory has already been synced with this app:

              ${state.application} (${state.environment})

          If you're sure that you want to sync:

              ${ctx.app.slug} (${ctx.env.name}) → ${directory.path}

          Run "ggt dev" with the {bold --allow-different-app} flag.
      `);
    }

    let previousEnvironment: string | undefined;
    if (state.environment !== ctx.env.name) {
      // the user specified a different environment, update the state
      ctx.log.printlns2`Changing environment from ${state.environment} → ${ctx.env.name}`;
      previousEnvironment = state.environment;
      state.environment = ctx.env.name;
      if (!state.environments[ctx.env.name]) {
        // the user has never synced to this environment before
        state.environments[ctx.env.name] = { filesVersion: "0" };
      }
    }

    return new SyncJson(ctx, directory, previousEnvironment, state);
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
  static async loadOrInit(ctx: Context<SyncJsonArgs>, { directory }: { directory: Directory }): Promise<SyncJson> {
    ctx = ctx.child({ name: "sync-json" });

    const state = await SyncJson.load(ctx, { directory });
    if (state) {
      // the .gadget/sync.json file already exists and is valid
      return state;
    }

    ctx.app = await loadApp(ctx, { availableApps: await getApps(ctx) });
    ctx.env = await loadEnv(ctx, { app: ctx.app });

    if ((await directory.isEmptyOrNonExistent()) || ctx.args["--allow-unknown-directory"]) {
      // the directory is empty or the user passed
      // --allow-unknown-directory, either way ensure the directory
      // exists and create a fresh .gadget/sync.json file
      await fs.ensureDir(directory.path);

      return new SyncJson(ctx, directory, undefined, {
        application: ctx.app.slug,
        environment: ctx.env.name,
        environments: {
          [ctx.env.name]: { filesVersion: "0" },
        },
      });
    }

    // the directory isn't empty and the user didn't pass --allow-unknown-directory
    throw new UnknownDirectoryError(ctx, { directory });
  }

  /**
   * Updates {@linkcode _syncJson} and saves it to `.gadget/sync.json`.
   */
  async save(filesVersion: string | bigint): Promise<void> {
    const environment = this.state.environments[this.state.environment];
    assert(environment, "environment must exist in environments");
    environment.filesVersion = String(filesVersion);

    this.ctx.log.debug("saving .gadget/sync.json");
    this._mtime = Date.now();
    await fs.outputJSON(
      this.directory.absolute(".gadget/sync.json"),
      {
        ...this.state,

        // v0.4
        app: this.state.application,
        filesVersion: String(filesVersion),
        mtime: this._mtime,
      },
      { spaces: 2 },
    );
  }

  /**
   * @returns true if the git branch has changed
   */
  async loadGitBranch(): Promise<void> {
    this.gitBranch = await loadBranch(this.ctx, { directory: this.directory });
  }

  async sprintState(): Promise<string> {
    await this.loadGitBranch();
    if (this.gitBranch) {
      return sprint`
        Application  ${this.app.slug}
        Environment  ${this.env.name}
         Git Branch  ${this.gitBranch}
      `;
    }

    return sprint`
      Application  ${this.app.slug}
      Environment  ${this.env.name}
    `;
  }

  async printState(): Promise<void> {
    this.ctx.log.println(await this.sprintState());
  }
}

export const loadSyncJsonDirectory = async (dir: string): Promise<Directory> => {
  if (config.windows && dir.startsWith("~/")) {
    // "~" doesn't expand to the home directory on Windows
    dir = homePath(dir.slice(2));
  }

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
const loadApp = async (
  ctx: Context<SyncJsonArgs>,
  { availableApps, state }: { availableApps: App[]; state?: SyncJsonState },
): Promise<App> => {
  let appSlug = ctx.args["--app"] || state?.application;
  if (!appSlug) {
    // the user didn't specify an app, ask them to select one
    appSlug = await select(ctx, {
      message: "Which application do you want to sync to?",
      choices: availableApps.map((x) => x.slug),
    });
  }

  const app = availableApps.find((app) => app.slug === appSlug);
  if (app) {
    // the user specified an app or we loaded it from the state,
    // and it exists in their list of applications, so return it
    return app;
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
    sprintln2`
      Unknown application:

        ${appSlug}

      Did you mean one of these?
    `.concat(`  • ${similarAppSlugs.join("\n  • ")}`),
  );
};

const loadEnv = async (ctx: Context<SyncJsonArgs>, { app, state }: { app: App; state?: SyncJsonState }): Promise<Environment> => {
  if (ctx.args["--env"] && !app.multiEnvironmentEnabled) {
    // this is a legacy app that only has 1 development environment, so
    // let them know now rather than running into a weird error later
    // TODO: come back to this
    throw new ArgError(
      sprint`
        You specified an environment but your app doesn't have multiple environments.

        Remove the "--env" flag to sync to the {bold ${app.primaryDomain}} environment.
      `,
    );
  }

  const devEnvs = app.environments.filter((env) => env.type === EnvironmentType.Development);

  let envName = ctx.args["--env"] || state?.environment;
  if (!envName) {
    // user didn't specify an environment, ask them to select one
    envName = await select(ctx, {
      message: "Which environment do you want to sync to?",
      choices: devEnvs.map((x) => x.name),
    });
  }

  if (envName.toLowerCase() === "production") {
    // specifically call out that they can't dev, push, or pull to prod
    throw new ArgError(
      sprint`
        You cannot "ggt ${ctx.command}" your {bold production} environment.
      `,
    );
  }

  // we've ensured envName is defined
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const env = devEnvs.find((env) => env.name === envName!.toLowerCase());
  if (env) {
    // the user specified an environment or we loaded it from the state,
    // and it exists in the app's list of environments, so return it
    return env;
  }

  // the specified env doesn't exist in their list of environments,
  // either they misspelled it or they don't have access to it
  // anymore, suggest some envs that are similar to the one they
  // specified
  const similarEnvironments = sortBySimilar(
    envName,
    devEnvs.map((env) => env.name),
  ).slice(0, 5);

  throw new ArgError(
    sprintln2`
      Unknown environment:

        ${envName}

      Did you mean one of these?
    `.concat(`  • ${similarEnvironments.join("\n  • ")}`),
  );
};

/**
 * Returns the current git branch of the directory or undefined if
 * the directory isn't a git repository.
 */
const loadBranch = async (ctx: Context<SyncJsonArgs>, { directory }: { directory: Directory }): Promise<string | undefined> => {
  try {
    const branch = await simpleGit(directory.path).revparse(["--abbrev-ref", "HEAD"]);
    return branch;
  } catch (error) {
    ctx.log.warn("failed to read git branch", { error });
    return undefined;
  }
};

export const SyncJsonStateV05 = z.object({
  application: z.string(),
  environment: z.string(),
  environments: z.record(z.object({ filesVersion: z.string() })),
});

export const SyncJsonStateV04 = z.object({
  app: z.string(),
  filesVersion: z.string(),
  mtime: z.number(),
});

// TODO: ensure v05 is parsed before v04
export const AnySyncJsonState = z.union([SyncJsonStateV05, SyncJsonStateV04]);

export const SyncJsonState = AnySyncJsonState.transform((state): SyncJsonStateV05 => {
  if ("environment" in state) {
    // v0.5
    return state;
  }

  // v0.4 -> v0.5
  return {
    application: state.app,
    environment: "development",
    environments: { development: { filesVersion: state.filesVersion } },
  };
});

export type SyncJsonStateV05 = z.infer<typeof SyncJsonStateV05>;
export type SyncJsonStateV04 = z.infer<typeof SyncJsonStateV04>;
export type AnySyncJsonState = z.infer<typeof AnySyncJsonState>;
export type SyncJsonState = z.infer<typeof SyncJsonState>;
