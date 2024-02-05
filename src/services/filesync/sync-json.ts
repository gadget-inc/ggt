import { findUp } from "find-up";
import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
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
import { isEmptyOrNonExistentDir } from "./filesync.js";

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

  readonly edit: Edit;

  private constructor(
    /**
     * The {@linkcode Context} that was used to initialize this
     * {@linkcode SyncJson} instance.
     */
    readonly ctx: Context<SyncJsonArgs>,

    /**
     * the root directory of the Gadget project, or in other words, the
     * directory that contains the `.gadget/sync.json` file.
     */
    readonly directory: Directory,

    /**
     * The state of the `.gadget/sync.json` file on the filesystem.
     */
    readonly state: SyncJsonState,
  ) {
    this.ctx = ctx.child({
      fields: () => ({
        syncJson: {
          directory: this.directory.path,
          ...this.state,
        },
      }),
    });

    assert(this.ctx.app, "app must be set on context");
    this.app = this.ctx.app;

    assert(this.ctx.env, "env must be set on context");
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
   * Loads a {@linkcode SyncJson} from the specified directory or
   * initializes a new one.
   *
   * - Ensures a user is logged in.
   * - Ensures the user has at least one application.
   * - Ensures the directory exists.
   * - Ensures the directory is empty or contains a `.gadget/sync.json` file, unless --allow-unknown-directory was passed
   * - Ensures the specified app matches the app the directory previously synced to, unless --allow-different-app was passed
   */
  static async loadOrInit(ctx: Context<SyncJsonArgs>, { directory: dir }: { directory?: string }): Promise<SyncJson> {
    ctx = ctx.child({ name: "sync-json" });

    const user = await getUserOrLogin(ctx);
    const apps = await getApps(ctx);
    if (apps.length === 0) {
      throw new ArgError(
        sprint`
          You (${user.email}) don't have have any Gadget applications.

          Visit https://gadget.new to create one!
      `,
      );
    }

    if (!dir) {
      // the user didn't specify a directory
      // TODO: do this regardless of whether the user specified a directory
      const syncJsonPath = await findUp(".gadget/sync.json");
      if (syncJsonPath) {
        // we found a .gadget/sync.json file, use its parent directory
        dir = path.join(syncJsonPath, "../..");
      } else {
        // we didn't find a .gadget/sync.json file, use the current directory
        dir = process.cwd();
      }
    }

    if (config.windows && dir.startsWith("~/")) {
      // "~" doesn't expand to the home directory on Windows
      dir = homePath(dir.slice(2));
    }

    // ensure the directory is an absolute path
    dir = path.resolve(dir);

    // ensure the directory exists
    // TODO: why do we need to ensure the directory exists?
    const wasEmptyOrNonExistent = await isEmptyOrNonExistentDir(dir);
    await fs.ensureDir(dir);
    const directory = await Directory.init(dir);

    // try to load the .gadget/sync.json file
    const syncJsonFile = await fs.readFile(path.join(dir, ".gadget/sync.json"), "utf8").catch(() => undefined);

    // try to parse the .gadget/sync.json file
    let state: SyncJsonState | undefined;
    try {
      state = SyncJsonState.parse(JSON.parse(syncJsonFile ?? "{}"));
    } catch (error) {
      ctx.log.warn("failed to parse .gadget/sync.json", { error, syncJsonFile });
    }

    let appSlug = ctx.args["--app"] || state?.application;
    if (!appSlug) {
      // the user didn't specify an app
      appSlug = await select(ctx, {
        message: "Which application do you want to sync to?",
        choices: apps.map((x) => x.slug),
      });
    }

    // try to find the appSlug in their list of apps
    const app = apps.find((app) => app.slug === appSlug);
    if (!app) {
      // the specified appSlug doesn't exist in their list of apps,
      // either they misspelled it or they don't have access to it
      // anymore, suggest some apps that are similar to the one they
      // specified
      const similarAppSlugs = sortBySimilar(
        appSlug,
        apps.map((app) => app.slug),
      ).slice(0, 5);

      throw new ArgError(
        sprintln2`
          Unknown application:

            ${appSlug}

          Did you mean one of these?
        `.concat(`  • ${similarAppSlugs.join("\n  • ")}`),
      );
    }

    if (ctx.args["--env"] && !app.multiEnvironmentEnabled) {
      // the user specified an environment but this is an old app that
      // doesn't have multiple environments, let them know rather than
      // silently ignoring the flag
      throw new ArgError(
        sprint`
            You specified an environment but your app doesn't have multiple environments.

            Remove the "--env" flag to sync to the {bold ${app.primaryDomain}} environment.
        `,
      );
    }

    let envName = ctx.args["--env"]?.toLowerCase() || state?.environment;
    if (!envName) {
      // user didn't specify an environment, show them a list of valid environments
      envName = await select(ctx, {
        message: "Which environment do you want to sync to?",
        choices: app.environments.filter((x) => x.type !== EnvironmentType.Production).map((x) => x.name),
      });
    }

    // if multi environment is enabled try to find the environment in the app's list
    const env = app.environments.find((env) => env.name === envName);
    if (!env) {
      const similarEnvironments = sortBySimilar(
        envName,
        app.environments.map((env) => env.name.toLowerCase()),
      ).slice(0, 5);

      throw new ArgError(
        sprintln2`
            Unknown environment:

              ${envName}

            Did you mean one of these?
          `.concat(`  • ${similarEnvironments.join("\n  • ")}`),
      );
    }

    ctx.app = app;
    ctx.env = env;

    if (!state) {
      // the .gadget/sync.json file didn't exist or contained invalid json
      if (wasEmptyOrNonExistent || ctx.args["--allow-unknown-directory"]) {
        // the directory is empty or the user passed --allow-unknown-directory
        // regardless, create a fresh .gadget/sync.json file
        return new SyncJson(ctx, directory, {
          application: app.slug,
          environment: env.name,
          environments: {
            [env.name]: { filesVersion: "0" },
          },
        });
      }

      // the directory isn't empty and the user didn't pass --allow-unknown-directory
      throw new UnknownDirectoryError({ dir, app: app.slug, syncJsonFile });
    }

    // .gadget/sync.json already exists
    if (state.application === app.slug) {
      // .gadget/sync.json is associated with the same app
      if (state.environment !== env.name) {
        // the user specified a different environment, update the state
        state.environment = env.name;
        if (!state.environments[env.name]) {
          // the user has never synced to this environment before
          state.environments[env.name] = { filesVersion: "0" };
        }
      }

      return new SyncJson(ctx, directory, state);
    }

    // .gadget/sync.json is associated with a different app
    if (ctx.args["--allow-different-app"]) {
      // the user passed --allow-different-app, so use the application
      // and environment they specified and clobber everything
      return new SyncJson(ctx, directory, {
        application: app.slug,
        environment: env.name,
        environments: {
          [env.name]: { filesVersion: "0" },
        },
      });
    }

    // the user didn't pass --allow-different-app, so throw an error
    throw new ArgError(sprint`
        You were about to sync the following app to the following directory:

            {dim ${app.slug}} {dim ({green ${envName}}) → ${dir}}

        However, that directory has already been synced with this app:

            {dim ${state.application}} {dim ({red ${state.environment}})}

        If you're sure that you want to sync:

            {dim ${app.slug}} {dim ({green ${envName}}) → ${dir}}

        Then run {dim ggt sync} again with the {dim --force} flag.
    `);
  }

  /**
   * Updates {@linkcode _syncJson} and saves it to `.gadget/sync.json`.
   */
  async save(filesVersion: string | bigint): Promise<void> {
    const environment = this.state.environments[this.state.environment];
    assert(environment, "environment must exist in environments");
    environment.filesVersion = String(filesVersion);

    this.ctx.log.debug("saving .gadget/sync.json");
    await fs.outputJSON(this.directory.absolute(".gadget/sync.json"), this.state, { spaces: 2 });
  }
}

export const SyncJsonStateV04 = z.object({
  app: z.string(),
  filesVersion: z.string(),
  mtime: z.number(),
});

export type SyncJsonStateV04 = z.infer<typeof SyncJsonStateV04>;

export const SyncJsonStateV05 = z.object({
  application: z.string(),
  environment: z.string(),
  environments: z.record(z.object({ filesVersion: z.string() })),
});

export type SyncJsonStateV05 = z.infer<typeof SyncJsonStateV05>;

export const AnySyncJsonState = z.union([SyncJsonStateV05, SyncJsonStateV04]);

export type AnySyncJsonState = z.infer<typeof AnySyncJsonState>;

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

export type SyncJsonState = z.infer<typeof SyncJsonState>;
