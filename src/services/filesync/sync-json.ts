import { findUp } from "find-up";
import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import { simpleGit } from "simple-git";
import terminalLink from "terminal-link";

import type { Command } from "../command/command.js";
import type { Context } from "../command/context.js";

import { EnvironmentType, type Application, type Environment } from "../app/app.js";
import { Edit } from "../app/edit/edit.js";
import { AppIdentity, AppIdentityArgs } from "../command/app-identity.js";
import { ArgError, type ArgsDefinition, type ArgsDefinitionResult } from "../command/arg.js";
import { config, homePath } from "../config/config.js";
import colors from "../output/colors.js";
import { println } from "../output/print.js";
import { sprint, sprintln, type SprintOptions } from "../output/sprint.js";
import { defaults } from "../util/object.js";
import { Directory } from "./directory.js";
import { UnknownDirectoryError } from "./error.js";
import { type SyncJsonState } from "./sync-json-state.js";

export const SyncJsonArgs = {
  ...AppIdentityArgs,
  "--allow-different-app": { type: Boolean, description: "Allow syncing a different app than the one in sync.json" },
  "--allow-unknown-directory": { type: Boolean, description: "Allow syncing an unrecognized directory" },
} satisfies ArgsDefinition;

export type SyncJsonArgs = typeof SyncJsonArgs;
export type SyncJsonArgsResult = ArgsDefinitionResult<SyncJsonArgs>;

/**
 * Tracks the state of the filesystem sync with the Gadget backend.
 *
 * This is persisted to `.gadget/sync.json` within the {@linkcode directory}.
 *
 * @see {@linkcode AppIdentity} for a lighter-weight object that tracks which app and environment we are working with.
 */
export class SyncJson {
  /**
   * The last git branch that was checked out in the directory.
   */
  gitBranch: string | undefined;

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
     * The {@linkcode AppIdentity} of the directory.
     */
    readonly appIdentity: AppIdentity,

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
  }

  get edit(): Edit {
    return this.appIdentity.edit;
  }

  get application(): Application {
    return this.appIdentity.application;
  }

  get environment(): Environment {
    return this.appIdentity.environment;
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
   *
   * @param appIdentity - Pre-loaded {@linkcode AppIdentity} to use
   *   instead of calling {@linkcode AppIdentity.load} internally.
   *   Used by {@linkcode loadOrAskAndInit} to avoid duplicate API
   *   calls when it needs the identity for initialization.
   */
  static async load(
    ctx: Context,
    {
      command,
      args,
      directory,
      appIdentity,
    }: { command: Command; args: SyncJsonArgsResult; directory: Directory; appIdentity?: AppIdentity },
  ): Promise<SyncJson | undefined> {
    ctx = ctx.child({ name: "sync-json" });

    appIdentity ??= await AppIdentity.load(ctx, { command, args, directory });
    const state = appIdentity.syncJsonState;

    if (!state) {
      // the .gadget/sync.json file doesn't exist in the directory
      // or any of its parents, or is invalid, so return undefined
      return undefined;
    }

    if (state.application !== appIdentity.application.slug) {
      // .gadget/sync.json is associated with a different app
      if (args["--allow-different-app"]) {
        // the user passed --allow-different-app, so use the application
        // and environment they specified and clobber everything
        const state = {
          application: appIdentity.application.slug,
          environment: appIdentity.environment.name,
          environments: {
            [appIdentity.environment.name]: { filesVersion: "0" },
          },
        };

        const syncJson =
          appIdentity.environment.type === EnvironmentType.Production
            ? new EphemeralSyncJson(ctx, args, directory, appIdentity, undefined, state)
            : new SyncJson(ctx, args, directory, appIdentity, undefined, state);

        await syncJson.loadGitBranch();
        return syncJson;
      }

      // the user didn't pass --allow-different-app, so throw an error
      throw new ArgError(sprint`
          You were about to sync the following app to the following directory:

              ${appIdentity.application.slug} (${appIdentity.environment.name}) → ${directory.path}

          However, that directory has already been synced with this app:

              ${state.application} (${state.environment})

          If you're sure that you want to sync:

              ${appIdentity.application.slug} (${appIdentity.environment.name}) → ${directory.path}

          Run "ggt dev" with the {bold --allow-different-app} flag.
      `);
    }

    let previousEnvironment: string | undefined;
    if (state.environment !== appIdentity.environment.name) {
      // the user specified a different environment

      if (appIdentity.environment.type !== "production") {
        // the new environment isn't a production environment, so let
        // the user know that we're changing environments (we're not
        // using the EphemeralSyncJson class)
        println({
          ensureEmptyLineAbove: true,
          content: sprint`
          Changing environment.

            ${state.environment} → ${appIdentity.environment.name}
        `,
        });
      }

      // update the state to the new environment
      previousEnvironment = state.environment;
      state.environment = appIdentity.environment.name;
      if (!state.environments[appIdentity.environment.name]) {
        // the user has never synced to this environment before
        state.environments[appIdentity.environment.name] = { filesVersion: "0" };
      }
    }

    const syncJson =
      appIdentity.environment.type === EnvironmentType.Production
        ? new EphemeralSyncJson(ctx, args, directory, appIdentity, previousEnvironment, state)
        : new SyncJson(ctx, args, directory, appIdentity, previousEnvironment, state);

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
  static async loadOrAskAndInit(
    ctx: Context,
    { command, args, directory }: { command: Command; args: SyncJsonArgsResult; directory: Directory },
  ): Promise<SyncJson> {
    ctx = ctx.child({ name: "sync-json" });

    const appIdentity = await AppIdentity.load(ctx, { command, args, directory });

    let syncJson = await SyncJson.load(ctx, { command, args, directory, appIdentity });
    if (syncJson) {
      // the .gadget/sync.json file already exists and is valid
      return syncJson;
    }

    if ((await directory.hasFiles()) && !args["--allow-unknown-directory"]) {
      // the directory isn't empty and the user didn't pass --allow-unknown-directory
      throw new UnknownDirectoryError({ command, args, directory });
    }

    // the directory is empty or the user passed
    // --allow-unknown-directory, either way ensure the directory exists
    // and create a fresh .gadget/sync.json file
    await fs.ensureDir(directory.path);

    const state = {
      application: appIdentity.application.slug,
      environment: appIdentity.environment.name,
      environments: {
        [appIdentity.environment.name]: { filesVersion: "0" },
      },
    };

    syncJson =
      appIdentity.environment.type === "production"
        ? new EphemeralSyncJson(ctx, args, directory, appIdentity, undefined, state)
        : new SyncJson(ctx, args, directory, appIdentity, undefined, state);

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

export { AnySyncJsonState, SyncJsonState, SyncJsonStateV1 } from "./sync-json-state.js";
