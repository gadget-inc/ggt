import { findUp } from "find-up";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import type { Ignore } from "ignore";
import ignore from "ignore";
import inquirer from "inquirer";
import _ from "lodash";
import ms from "ms";
import path from "node:path";
import process from "node:process";
import normalizePath from "normalize-path";
import { dedent } from "ts-dedent";
import { z } from "zod";
import type {
  PublishFileSyncEventsMutation,
  PublishFileSyncEventsMutationVariables,
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables,
  RemoteFilesVersionQuery,
  RemoteFilesVersionQueryVariables,
} from "../__generated__/graphql.js";
import type { App } from "./app.js";
import { getApps } from "./app.js";
import { breadcrumb } from "./breadcrumbs.js";
import type { Query } from "./client.js";
import { config } from "./config.js";
import { ArgError, InvalidSyncFileError } from "./errors.js";
import { isEmptyDir, swallowEnoent } from "./fs-utils.js";
import { sortByLevenshtein, sprint } from "./output.js";
import type { User } from "./user.js";

export class FileSync {
  /**
   * Writes {@linkcode _state} to `.gadget/sync.json`.
   *
   * This is debounced so that it can be called every time the state
   * changes, but only actually writes to the filesystem once it hasn't
   * changed for 100ms.
   */
  private _save = _.debounce(() => {
    fs.outputJSONSync(path.join(this.dir, ".gadget/sync.json"), this._state, { spaces: 2 });
    breadcrumb({
      type: "info",
      category: "sync",
      message: "Saved sync state",
      data: { state: this._state },
    });
  }, ms("100ms"));

  /**
   * The {@linkcode Ignore} instance that is used to determine if a file
   * should be ignored.
   *
   * @see https://www.npmjs.com/package/ignore
   */
  private _ignorer!: Ignore;

  private constructor(
    /**
     * An absolute path to the directory that is being synced.
     */
    readonly dir: string,

    /**
     * The Gadget application this filesystem is synced to.
     */
    readonly app: App,

    /**
     * Additional paths to ignore when syncing the filesystem.
     */
    private _extraIgnorePaths: string[],

    /**
     * The state of the filesystem.
     *
     * This is persisted to `.gadget/sync.json`.
     */
    private _state: { app: string; filesVersion: string; mtime: number },
  ) {
    this._save();
    this.flush();
    this.reloadIgnorePaths();
  }

  /**
   * The last filesVersion that was written to the filesystem.
   *
   * This determines if the filesystem in Gadget is ahead of the
   * filesystem on the local machine.
   */
  get filesVersion(): bigint {
    return BigInt(this._state.filesVersion);
  }

  set filesVersion(value: bigint | string) {
    this._state.filesVersion = String(value);
    this._save();
  }

  /**
   * The largest mtime that was seen on the filesystem.
   *
   * This is used to determine if any files have changed since the last
   * sync. This does not include the mtime of files that are ignored.
   */
  // eslint-disable-next-line @typescript-eslint/member-ordering
  get mtime(): number {
    return this._state.mtime;
  }

  set mtime(value: number) {
    this._state.mtime = value;
    this._save();
  }

  /**
   * The state of the filesystem.
   */
  // eslint-disable-next-line @typescript-eslint/member-ordering
  get state() {
    return Object.freeze({ ...this._state });
  }

  /**
   * Initializes a {@linkcode FileSync} instance.
   * - Ensures the directory exists.
   * - Ensures the directory is empty or contains a `.gadget/sync.json` file (unless `options.force` is `true`)
   * - Ensures an app is specified (either via `options.app` or by prompting the user)
   * - Ensures the specified app matches the app the directory was previously synced to (unless `options.force` is `true`)
   */
  static async init(user: User, options: { dir?: string; app?: string; force?: boolean; extraIgnorePaths?: string[] }): Promise<FileSync> {
    const apps = await getApps(user);
    if (apps.length === 0) {
      throw new ArgError(
        sprint`
          You (${user.email}) don't have have any Gadget applications.

          Visit https://gadget.new to create one!
      `,
      );
    }

    let dir = options.dir;
    if (!dir) {
      // the user didn't specify a directory
      const filepath = await findUp(".gadget/sync.json");
      if (filepath) {
        // we found a .gadget/sync.json file, use its parent directory
        dir = path.join(filepath, "../..");
      } else {
        // we didn't find a .gadget/sync.json file, use the current directory
        dir = process.cwd();
      }
    }

    if (config.windows && _.startsWith(dir, "~/")) {
      // `~` doesn't expand to the home directory on Windows
      dir = path.join(config.homeDir, dir.slice(2));
    }

    // ensure the root directory is an absolute path and exists
    await fs.ensureDir((dir = path.resolve(dir)));

    // try to load the .gadget/sync.json file
    const state = await fs
      .readJson(path.join(dir, ".gadget/sync.json"))
      .then(
        z.object({
          app: z.string(),
          filesVersion: z.string(),
          mtime: z.number(),
        }).parse,
      )
      .catch(() => undefined);

    let appSlug = options.app || state?.app;
    if (!appSlug) {
      // the user didn't specify an app, suggest some apps that they can sync to
      ({ appSlug } = await inquirer.prompt<{ appSlug: string }>({
        type: "list",
        name: "appSlug",
        message: "Please select the app to sync to.",
        choices: _.map(apps, "slug"),
      }));
    }

    // try to find the appSlug in their list of apps
    const app = _.find(apps, ["slug", appSlug]);
    if (!app) {
      // the specified appSlug doesn't exist in their list of apps,
      // either they misspelled it or they don't have access to it
      // anymore, suggest some apps that are similar to the one they
      // specified
      const similarAppSlugs = sortByLevenshtein(appSlug, _.map(apps, "slug")).slice(0, 5);
      throw new ArgError(
        sprint`
        Unknown application:

          ${appSlug}

        Did you mean one of these?


      `.concat(`  • ${similarAppSlugs.join("\n  • ")}`),
      );
    }

    const ignore = options.extraIgnorePaths ?? [];

    if (!state) {
      // the .gadget/sync.json file didn't exist or contained invalid json
      if ((await isEmptyDir(dir)) || options.force) {
        // the directory is empty or the user passed --force
        // either way, create a fresh .gadget/sync.json file
        return new FileSync(dir, app, ignore, { app: app.slug, filesVersion: "0", mtime: 0 });
      }

      // the directory isn't empty and the user didn't pass --force
      throw new InvalidSyncFileError(dir, app.slug);
    }

    // the .gadget/sync.json file exists
    if (state.app === app.slug) {
      // the .gadget/sync.json file is for the same app that the user specified
      return new FileSync(dir, app, ignore, state);
    }

    // the .gadget/sync.json file is for a different app
    if (options.force) {
      // the user passed --force, so use the app they specified and overwrite everything
      return new FileSync(dir, app, ignore, { app: app.slug, filesVersion: "0", mtime: 0 });
    }

    // the user didn't pass --force, so throw an error
    throw new ArgError(sprint`
        You were about to sync the following app to the following directory:

          {dim ${app.slug}} → {dim ${dir}}

        However, that directory has already been synced with this app:

          {dim ${state.app}}

        If you're sure that you want to sync:

          {dim ${app.slug}} → {dim ${dir}}

        Then run {dim ggt sync} again with the {dim --force} flag.
      `);
  }

  /**
   * Flushes any debounced {@linkcode _save}s to the filesystem.
   */
  flush(): void {
    this._save.flush();
  }

  /**
   * Converts an absolute path into a relative one from {@linkcode dir}.
   */
  relative(to: string): string {
    if (!path.isAbsolute(to)) {
      // the filepath is already relative
      return to;
    }

    return path.relative(this.dir, to);
  }

  /**
   * Converts a relative path into an absolute one from {@linkcode dir}.
   */
  absolute(...pathSegments: string[]): string {
    return path.resolve(this.dir, ...pathSegments);
  }

  /**
   * Similar to {@linkcode relative} in that it converts an absolute
   * path into a relative one from {@linkcode dir}. However, it also
   * changes any slashes to be posix/unix-like forward slashes,
   * condenses repeated slashes into a single slash, and adds a trailing
   * slash if the path is a directory.
   *
   * This is used when sending file-sync events to Gadget to ensure that
   * the paths are consistent across platforms.
   *
   * @see https://www.npmjs.com/package/normalize-path
   */
  normalize(filepath: string, isDirectory: boolean): string {
    return normalizePath(path.isAbsolute(filepath) ? this.relative(filepath) : filepath) + (isDirectory ? "/" : "");
  }

  /**
   * Reloads the ignore rules from the `.ignore` file.
   */
  reloadIgnorePaths(): void {
    this._ignorer = ignore.default();
    this._ignorer.add([".DS_Store", "node_modules", ".git", ...this._extraIgnorePaths]);

    try {
      const content = fs.readFileSync(this.absolute(".ignore"), "utf-8");
      this._ignorer.add(content);
      breadcrumb({ type: "debug", category: "sync", message: "Reloaded ignore rules" });
    } catch (error) {
      swallowEnoent(error);
    }
  }

  /**
   * Returns `true` if the {@linkcode filepath} should be ignored.
   */
  ignores(filepath: string): boolean {
    const relative = this.relative(filepath);
    if (relative == "") {
      // don't ignore the root dir
      return false;
    }

    if (_.startsWith(relative, "..")) {
      // anything above the root dir is ignored
      return true;
    }

    return this._ignorer.ignores(relative);
  }

  /**
   * Walks the directory and yields each file and directory.
   *
   * If a directory is empty, or only contains ignored entries, it will
   * be yielded as a directory. Otherwise, each file within the
   * directory will be yielded.
   */
  async *walkDir({ dir = this.dir, skipIgnored = true } = {}): AsyncGenerator<[absolutePath: string, entry: Stats]> {
    // track whether the directory has any entries (ignored entries don't count)
    let hasEntries = false;

    for await (const entry of await fs.opendir(dir)) {
      const filepath = path.join(dir, entry.name);
      if (skipIgnored && this.ignores(filepath)) {
        continue;
      }

      hasEntries = true;

      if (entry.isDirectory()) {
        yield* this.walkDir({ dir: filepath, skipIgnored });
      } else if (entry.isFile()) {
        yield [filepath, await fs.stat(filepath)];
      }
    }

    if (!hasEntries) {
      // if the directory is empty, or only contains ignored entries, yield it as a directory
      yield [`${dir}/`, await fs.stat(dir)];
    }
  }

  /**
   * Rather than `rm -rf`ing files, we move them to `.gadget/backup/` so
   * that users can recover them if something goes wrong.
   */
  async softDelete(filepath: string): Promise<void> {
    try {
      const relative = this.relative(filepath);
      const absolute = this.absolute(filepath);
      await fs.move(absolute, this.absolute(".gadget/backup", relative), {
        overwrite: true,
      });
    } catch (error) {
      // replicate the behavior of `rm -rf` and ignore ENOENT
      swallowEnoent(error);
    }
  }
}

export const REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION = dedent(/* GraphQL */ `
  subscription RemoteFileSyncEvents($localFilesVersion: String!) {
    remoteFileSyncEvents(localFilesVersion: $localFilesVersion, encoding: base64) {
      remoteFilesVersion
      changed {
        path
        mode
        content
        encoding
      }
      deleted {
        path
      }
    }
  }
`) as Query<RemoteFileSyncEventsSubscription, RemoteFileSyncEventsSubscriptionVariables>;

export const REMOTE_FILES_VERSION_QUERY = dedent(/* GraphQL */ `
  query RemoteFilesVersion {
    remoteFilesVersion
  }
`) as Query<RemoteFilesVersionQuery, RemoteFilesVersionQueryVariables>;

export const PUBLISH_FILE_SYNC_EVENTS_MUTATION = dedent(/* GraphQL */ `
  mutation PublishFileSyncEvents($input: PublishFileSyncEventsInput!) {
    publishFileSyncEvents(input: $input) {
      remoteFilesVersion
    }
  }
`) as Query<PublishFileSyncEventsMutation, PublishFileSyncEventsMutationVariables>;
