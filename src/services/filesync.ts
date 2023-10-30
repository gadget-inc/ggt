import chalk from "chalk";
import { findUp } from "find-up";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import type { Ignore } from "ignore";
import ignore from "ignore";
import ms from "ms";
import assert from "node:assert";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import normalizePath from "normalize-path";
import pMap from "p-map";
import pRetry from "p-retry";
import pluralize from "pluralize";
import type { Jsonifiable } from "type-fest";
import { z } from "zod";
import { FileSyncEncoding } from "../__generated__/graphql.js";
import type { App } from "./app.js";
import { getApps } from "./app.js";
import { mapRecords, mapValues } from "./collections.js";
import { config } from "./config.js";
import {
  EditGraphQL,
  FILES_QUERY,
  FILE_HASHES_QUERY,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "./edit-graphql.js";
import { ArgError, InvalidSyncFileError } from "./errors.js";
import { isEmptyOrNonExistentDir, swallowEnoent } from "./fs.js";
import { createLogger } from "./log.js";
import { noop } from "./noop.js";
import { printTable, println, printlns, sortBySimilarity, sprint } from "./print.js";
import { select } from "./prompt.js";
import type { User } from "./user.js";

const log = createLogger("filesync");

const ALWAYS_IGNORE_PATHS = [".DS_Store", "node_modules", ".git"] as const;

export interface File {
  path: string;
  oldPath?: string;
  mode: number;
  content: string;
  encoding: FileSyncEncoding;
}

export class FileSync {
  /**
   * The {@linkcode Ignore} instance that is used to determine if a file
   * should be ignored.
   *
   * @see https://www.npmjs.com/package/ignore
   */
  private _ignorer!: Ignore;

  private _editGraphQL: EditGraphQL;

  private constructor(
    /**
     * An absolute path to the directory that is being synced.
     */
    readonly dir: string,

    /**
     * Whether the directory was empty when it was initialized.
     */
    readonly wasEmpty: boolean,

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
    this.reloadIgnorePaths();
    this._editGraphQL = new EditGraphQL(this.app);
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

  /**
   * The largest mtime that was seen on the filesystem.
   *
   * This is used to determine if any files have changed since the last
   * sync. This does not include the mtime of files that are ignored.
   */
  get mtime(): number {
    return this._state.mtime;
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

    if (config.windows && dir.startsWith("~/")) {
      // `~` doesn't expand to the home directory on Windows
      dir = path.join(config.homeDir, dir.slice(2));
    }

    // ensure the root directory is an absolute path and exists
    await fs.ensureDir((dir = path.resolve(dir)));

    // try to load the .gadget/sync.json file
    const state = await fs
      .readJson(path.join(dir, ".gadget/sync.json"))
      .then((json) =>
        z
          .object({
            app: z.string(),
            filesVersion: z.string(),
            mtime: z.number(),
          })
          .parse(json),
      )
      .catch(noop);

    let appSlug = options.app || state?.app;
    if (!appSlug) {
      // the user didn't specify an app, suggest some apps that they can sync to
      appSlug = await select({
        message: "Please select the app to sync to.",
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
      const similarAppSlugs = sortBySimilarity(
        appSlug,
        apps.map((app) => app.slug),
      ).slice(0, 5);

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
      const isEmpty = await isEmptyOrNonExistentDir(dir);
      if (isEmpty || options.force) {
        // the directory is empty or the user passed --force
        // either way, create a fresh .gadget/sync.json file
        return new FileSync(dir, isEmpty, app, ignore, { app: app.slug, filesVersion: "0", mtime: 0 });
      }

      // the directory isn't empty and the user didn't pass --force
      throw new InvalidSyncFileError(dir, app.slug);
    }

    // the .gadget/sync.json file exists
    if (state.app === app.slug) {
      // the .gadget/sync.json file is for the same app that the user specified
      return new FileSync(dir, false, app, ignore, state);
    }

    // the .gadget/sync.json file is for a different app
    if (options.force) {
      // the user passed --force, so use the app they specified and overwrite everything
      return new FileSync(dir, false, app, ignore, { app: app.slug, filesVersion: "0", mtime: 0 });
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
    if (path.isAbsolute(filepath)) {
      filepath = this.relative(filepath);
    }

    filepath = normalizePath(filepath);

    if (isDirectory) {
      filepath += "/";
    }

    return filepath;
  }

  /**
   * Reloads the ignore rules from the `.ignore` file.
   */
  reloadIgnorePaths(overrideExtraIgnorePaths?: string[]): void {
    this._ignorer = ignore.default();
    this._ignorer.add([...ALWAYS_IGNORE_PATHS, ...(overrideExtraIgnorePaths ?? this._extraIgnorePaths)]);

    try {
      const content = fs.readFileSync(this.absolute(".ignore"), "utf-8");
      this._ignorer.add(content);
      log.info("reloaded ignore rules");
    } catch (error) {
      swallowEnoent(error);
    }
  }

  /**
   * Returns `true` if the {@linkcode filepath} should be ignored.
   */
  ignores(filepath: string): boolean {
    const relative = this.relative(filepath);
    if (relative === "") {
      // don't ignore the root dir
      return false;
    }

    if (relative.startsWith("..")) {
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
    const stats = await fs.stat(dir);
    assert(stats.isDirectory(), `expected ${dir} to be a directory`);

    yield [`${dir}/`, stats];

    for await (const entry of await fs.opendir(dir)) {
      const filepath = path.join(dir, entry.name);
      if (skipIgnored && this.ignores(filepath)) {
        continue;
      }

      if (entry.isDirectory()) {
        yield* this.walkDir({ dir: filepath, skipIgnored });
      } else if (entry.isFile()) {
        yield [filepath, await fs.stat(filepath)];
      }
    }
  }

  async changeLocalFilesystem(options: {
    filesVersion: bigint | string;
    files: Iterable<File>;
    delete: Iterable<string>;
    force?: boolean;
  }): Promise<ChangedFiles> {
    const filesVersion = BigInt(options.filesVersion);
    const added: string[] = [];
    const changed: string[] = [];

    await pMap(options.delete, async (filepath) => {
      const currentPath = this.absolute(filepath);
      const backupPath = this.absolute(".gadget/backup", this.relative(filepath));

      // rather than `rm -rf`ing files, we move them to
      // `.gadget/backup/` so that users can recover them if something
      // goes wrong. We've seen a lot of EBUSY/EINVAL errors when moving
      // files so we retry a few times.
      await pRetry(
        async () => {
          try {
            // remove the current backup file in case it exists and is a
            // different type (file vs directory)
            await fs.remove(backupPath);
            await fs.move(currentPath, backupPath);
          } catch (error) {
            // replicate the behavior of `rm -rf` and ignore ENOENT
            swallowEnoent(error);
          }
        },
        {
          retries: 2,
          minTimeout: ms("100ms"),
          onFailedAttempt: (error) => {
            log.warn("failed to move file to backup", { error });
          },
        },
      );
    });

    await pMap(options.files, async (file) => {
      const absolutePath = this.absolute(file.path);
      if (await fs.pathExists(absolutePath)) {
        changed.push(file.path);
      } else {
        added.push(file.path);
      }

      if (file.path.endsWith("/")) {
        await fs.ensureDir(absolutePath, { mode: 0o755 });
        return;
      }

      await fs.ensureDir(path.dirname(absolutePath), { mode: 0o755 });
      await fs.writeFile(absolutePath, Buffer.from(file.content, file.encoding), { mode: file.mode });

      if (absolutePath === this.absolute(".ignore")) {
        this.reloadIgnorePaths();
      }
    });

    this._state.mtime = Date.now();
    if (filesVersion > BigInt(this._state.filesVersion) || options.force) {
      this._state.filesVersion = String(filesVersion);
    }

    this._save();

    const changes = new ChangedFiles({ added, changed, deleted: options.delete });
    log.info("wrote", { ...this._state, changes });

    return changes;
  }

  async sendChangesToGadget(changes: { changed: Iterable<File>; deleted: Iterable<string> }): Promise<ChangedFiles> {
    const { publishFileSyncEvents } = await this._editGraphQL.query({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      variables: {
        input: {
          expectedRemoteFilesVersion: String(this.filesVersion),
          changed: Array.from(changes.changed),
          deleted: mapRecords(changes.deleted, "path"),
        },
      },
    });

    this._state.filesVersion = publishFileSyncEvents.remoteFilesVersion;
    this._save();

    return new ChangedFiles({
      added: [],
      changed: mapValues(changes.changed, "path"),
      deleted: changes.deleted,
    });
  }

  async getFilesFromGadget({
    filesVersion,
    paths,
  }: {
    filesVersion?: bigint;
    paths: string[];
  }): Promise<{ filesVersion: bigint; files: File[] }> {
    const data = await this._editGraphQL.query({
      query: FILES_QUERY,
      variables: {
        paths,
        filesVersion: String(filesVersion ?? this.filesVersion),
        encoding: FileSyncEncoding.Base64,
      },
    });

    return {
      filesVersion: BigInt(data.files.filesVersion),
      files: data.files.files,
    };
  }

  receiveChangesFromGadget({
    onChanges,
    onError,
  }: {
    onChanges: (changes: { filesVersion: bigint; changed: File[]; deleted: string[] }) => void;
    onError: (error: unknown) => void;
  }): () => void {
    return this._editGraphQL.subscribe(
      {
        query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
        // the reason this is a function rather than a static value is
        // so that it will be re-evaluated if the connection is lost and
        // then re-established. this ensures that we send our current
        // filesVersion rather than the one that was sent when the
        // connection was first established.
        variables: () => ({ localFilesVersion: String(this.filesVersion) }),
      },
      {
        error: onError,
        next: ({ remoteFileSyncEvents }) => {
          log.info("received files", {
            remoteFilesVersion: remoteFileSyncEvents.remoteFilesVersion,
            changed: mapValues(remoteFileSyncEvents.changed, "path", 10),
            deleted: mapValues(remoteFileSyncEvents.deleted, "path", 10),
          });

          onChanges({
            filesVersion: BigInt(remoteFileSyncEvents.remoteFilesVersion),
            changed: remoteFileSyncEvents.changed,
            deleted: mapValues(remoteFileSyncEvents.deleted, "path"),
          });
        },
      },
    );
  }

  async changes(): Promise<{
    /**
     * The latest filesVersion in Gadget.
     */
    gadgetFilesVersion: bigint;

    /**
     * The changes that have been made to the local filesystem since the
     * last time we synced.
     */
    localChanges: ChangedHashes;

    /**
     * The changes that have been made to Gadget since the last time we
     * synced.
     */
    gadgetChanges: ChangedHashes;

    /**
     * The files that need to be changed on the local filesystem to match
     * Gadget.
     */
    localToGadget: FilesToChange;

    /**
     * The files that need to be changed in Gadget to match the local
     * filesystem.
     */
    gadgetToLocal: FilesToChange;
  }> {
    const [localHashes, [, filesVersionHashes], [gadgetFilesVersion, gadgetHashes]] = await Promise.all([
      fileHashes(this),
      gadgetFileHashes(this._editGraphQL, this.filesVersion),
      gadgetFileHashes(this._editGraphQL),
    ]);

    return {
      gadgetFilesVersion: BigInt(gadgetFilesVersion),
      localChanges: new ChangedHashes({ from: localHashes, to: filesVersionHashes }),
      gadgetChanges: new ChangedHashes({ from: gadgetHashes, to: filesVersionHashes }),

      localToGadget: new FilesToChange({ from: localHashes, to: gadgetHashes }),
      gadgetToLocal: new FilesToChange({ from: gadgetHashes, to: localHashes }),
    };
  }

  /**
   * Synchronously writes {@linkcode _state} to `.gadget/sync.json`.
   */
  private _save(): void {
    fs.outputJSONSync(this.absolute(".gadget/sync.json"), this._state, { spaces: 2 });
  }
}

export class FilesToChange {
  readonly add: string[] = [];
  readonly change: string[] = [];
  readonly delete: string[] = [];

  constructor({ from, to }: { from: Hashes; to: Hashes }) {
    const sourcePaths = Object.keys(from);

    for (const [targetPath, targetHash] of Object.entries(to)) {
      const sourceHash = from[targetPath];
      if (!sourceHash) {
        if (!targetPath.endsWith("/") || !sourcePaths.some((sourcePath) => sourcePath.startsWith(targetPath))) {
          // targetPath is a file and it doesn't exist in source OR
          // targetPath is a directory and source doesn't have any
          // existing files inside it, therefor the targetPath has been
          // deleted
          this.delete.push(targetPath);
        }
      } else if (sourceHash !== targetHash) {
        // the file/directory exists in target, but has a different
        // hash, so it's been changed
        this.change.push(targetPath);
      }
    }

    for (const sourcePath of sourcePaths) {
      if (!to[sourcePath]) {
        // the source's file or directory doesn't exist in target, so
        // it's been added
        this.add.push(sourcePath);
      }
    }
  }

  get length(): number {
    return this.add.length + this.change.length + this.delete.length;
  }

  longestFilePath(): number {
    return Math.max(
      ...this.add
        .concat(this.change)
        .concat(this.delete)
        .map((path) => path.length),
    );
  }

  sortedTypes(): (readonly [string, "added" | "changed" | "deleted"])[] {
    const paths = [];
    paths.push(...this.add.map((p) => [p, "added"] as const));
    paths.push(...this.change.map((p) => [p, "changed"] as const));
    paths.push(...this.delete.map((p) => [p, "deleted"] as const));
    return paths.sort(([a], [b]) => a.localeCompare(b));
  }

  /**
   * Prints the changes that will be made.
   */
  print(): void {
    const longestFilePath = this.longestFilePath();

    for (const [filepath, type] of this.sortedTypes()) {
      switch (type) {
        case "added":
          println`{green +   ${filepath.padEnd(longestFilePath)}   add}`;
          break;
        case "changed":
          println`{yellow +-  ${filepath.padEnd(longestFilePath)}   change}`;
          break;
        case "deleted":
          println`{red -   ${filepath.padEnd(longestFilePath)}   delete}`;
          break;
      }
    }

    const nFiles = pluralize("file", this.length, true);

    printlns`
    {gray ${nFiles} in total. ${this.add.length} to add, ${this.change.length} to change, ${this.delete.length} to delete.}
  `;
  }

  toJSON(): Jsonifiable {
    return {
      add: this.add,
      change: this.change,
      delete: this.delete,
    };
  }
}

export class ChangedFiles {
  readonly added: string[];
  readonly changed: string[];
  readonly deleted: string[];

  constructor({ added, changed, deleted }: { added: Iterable<string>; changed: Iterable<string>; deleted: Iterable<string> }) {
    this.added = Array.from(added);
    this.changed = Array.from(changed);
    this.deleted = Array.from(deleted);
  }

  get length(): number {
    return this.added.length + this.changed.length + this.deleted.length;
  }

  longestFilePath(): number {
    return Math.max(
      ...this.added
        .concat(this.changed)
        .concat(this.deleted)
        .map((path) => path.length),
    );
  }

  sortedTypes(): (readonly [string, "added" | "changed" | "deleted"])[] {
    const paths = [];
    paths.push(...this.added.map((p) => [p, "added"] as const));
    paths.push(...this.changed.map((p) => [p, "changed"] as const));
    paths.push(...this.deleted.map((p) => [p, "deleted"] as const));
    return paths.sort(([a], [b]) => a.localeCompare(b));
  }

  /**
   * Prints the changes that were made.
   */
  print(): void {
    const longestFilePath = this.longestFilePath();

    for (const [filepath, type] of this.sortedTypes()) {
      switch (type) {
        case "added":
          println`{green +   ${filepath.padEnd(longestFilePath)}   added}`;
          break;
        case "changed":
          println`{yellow +-  ${filepath.padEnd(longestFilePath)}   changed}`;
          break;
        case "deleted":
          println`{red -   ${filepath.padEnd(longestFilePath)}   deleted}`;
          break;
      }
    }

    const nFiles = pluralize("file", this.length, true);

    printlns`
    {gray ${nFiles} in total. ${this.added.length} added, ${this.changed.length} changed, ${this.deleted.length} deleted.}
  `;
  }

  toJSON(): Jsonifiable {
    return {
      add: this.added,
      change: this.changed,
      delete: this.deleted,
    };
  }
}

export class ChangedHashes extends ChangedFiles {
  readonly from: Hashes;
  readonly to: Hashes;

  constructor({ from, to }: { from: Hashes; to: Hashes }) {
    const changed = [];
    const added = [];
    const deleted = [];

    const fromPaths = Object.keys(from);

    for (const [toPath, toHash] of Object.entries(to)) {
      const fromHash = from[toPath];
      if (!fromHash) {
        if (!toPath.endsWith("/") || !fromPaths.some((sourcePath) => sourcePath.startsWith(toPath))) {
          // targetPath is a file and it doesn't exist in source OR
          // targetPath is a directory and source doesn't have any
          // existing files inside it, therefor the targetPath has been
          // deleted
          deleted.push(toPath);
        }
      } else if (fromHash !== toHash) {
        // the file/directory exists in target, but has a different
        // hash, so it's been changed
        changed.push(toPath);
      }
    }

    for (const sourcePath of fromPaths) {
      if (!to[sourcePath]) {
        // the source's file or directory doesn't exist in target, so
        // it's been added
        added.push(sourcePath);
      }
    }

    super({ added, changed, deleted });
    this.from = from;
    this.to = to;
  }
}

export class FileConflicts {
  readonly youAddedTheyAdded: string[];
  readonly youAddedTheyChanged: string[];
  readonly youAddedTheyDeleted: string[];

  readonly youChangedTheyAdded: string[];
  readonly youChangedTheyChanged: string[];
  readonly youChangedTheyDeleted: string[];

  readonly youDeletedTheyAdded: string[];
  readonly youDeletedTheyChanged: string[];

  constructor(
    readonly you: ChangedHashes,
    readonly they: ChangedHashes,
  ) {
    const hashesAreDifferent = (path: string): boolean => you.to[path] !== they.to[path];

    this.youAddedTheyAdded = you.added.filter((path) => they.added.includes(path) && hashesAreDifferent(path));
    this.youAddedTheyChanged = you.added.filter((path) => they.changed.includes(path) && hashesAreDifferent(path));
    this.youAddedTheyDeleted = you.added.filter((path) => they.deleted.includes(path));

    this.youChangedTheyAdded = you.changed.filter((path) => they.added.includes(path) && hashesAreDifferent(path));
    this.youChangedTheyChanged = you.changed.filter((path) => they.changed.includes(path) && hashesAreDifferent(path));
    this.youChangedTheyDeleted = you.changed.filter((path) => they.deleted.includes(path));

    this.youDeletedTheyAdded = you.deleted.filter((path) => they.added.includes(path));
    this.youDeletedTheyChanged = you.deleted.filter((path) => they.changed.includes(path));
  }

  get length(): number {
    return (
      this.youAddedTheyAdded.length +
      this.youAddedTheyChanged.length +
      this.youAddedTheyDeleted.length +
      this.youChangedTheyAdded.length +
      this.youChangedTheyChanged.length +
      this.youChangedTheyDeleted.length +
      this.youDeletedTheyAdded.length +
      this.youDeletedTheyChanged.length
    );
  }

  sortedTypes(): (readonly [
    string,
    (
      | "youAddedTheyAdded"
      | "youAddedTheyChanged"
      | "youAddedTheyDeleted"
      | "youChangedTheyAdded"
      | "youChangedTheyChanged"
      | "youChangedTheyDeleted"
      | "youDeletedTheyAdded"
      | "youDeletedTheyChanged"
    ),
  ])[] {
    const paths = [];
    paths.push(...this.youAddedTheyAdded.map((p) => [p, "youAddedTheyAdded"] as const));
    paths.push(...this.youAddedTheyChanged.map((p) => [p, "youAddedTheyChanged"] as const));
    paths.push(...this.youAddedTheyDeleted.map((p) => [p, "youAddedTheyDeleted"] as const));
    paths.push(...this.youChangedTheyAdded.map((p) => [p, "youChangedTheyAdded"] as const));
    paths.push(...this.youChangedTheyChanged.map((p) => [p, "youChangedTheyChanged"] as const));
    paths.push(...this.youChangedTheyDeleted.map((p) => [p, "youChangedTheyDeleted"] as const));
    paths.push(...this.youDeletedTheyAdded.map((p) => [p, "youDeletedTheyAdded"] as const));
    paths.push(...this.youDeletedTheyChanged.map((p) => [p, "youDeletedTheyChanged"] as const));
    return paths.sort(([a], [b]) => a.localeCompare(b));
  }

  print(): void {
    const added = chalk.green("added");
    const changed = chalk.yellow("changed");
    const deleted = chalk.red("deleted");

    printTable({
      headers: ["", " You", "Gadget"],
      rows: this.sortedTypes().map(([filepath, type]) => {
        switch (type) {
          case "youAddedTheyAdded":
            return [filepath, added, added];
          case "youAddedTheyChanged":
            return [filepath, added, changed];
          case "youAddedTheyDeleted":
            return [filepath, added, deleted];
          case "youChangedTheyAdded":
            return [filepath, changed, added];
          case "youChangedTheyChanged":
            return [filepath, changed, changed];
          case "youChangedTheyDeleted":
            return [filepath, changed, deleted];
          case "youDeletedTheyAdded":
            return [filepath, deleted, added];
          case "youDeletedTheyChanged":
            return [filepath, deleted, changed];
        }
      }),
    });
  }
}

const Hashes = z.record(z.string());

export type Hashes = z.infer<typeof Hashes>;

export const gadgetFileHashes = async (
  graphql: EditGraphQL,
  filesVersion?: bigint | string,
  ignorePrefixes?: string[],
): Promise<[bigint, Hashes]> => {
  const { fileHashes } = await graphql.query({
    query: FILE_HASHES_QUERY,
    variables: {
      filesVersion: filesVersion?.toString(),
      ignorePrefixes,
    },
  });

  return [BigInt(fileHashes.filesVersion), Hashes.parse(fileHashes.hashes)];
};

export const fileHashes = async (filesync: FileSync): Promise<Hashes> => {
  try {
    // these ignore paths are allowed to be different between ggt and gadget
    filesync.reloadIgnorePaths([".gadget/sync.json", ".gadget/backup"]);
    const files = {} as Record<string, string>;

    for await (const [absolutePath, stats] of filesync.walkDir()) {
      const filepath = filesync.normalize(absolutePath, stats.isDirectory());
      switch (true) {
        case stats.isFile():
          files[filepath] = await fileHash(absolutePath);
          break;
        case stats.isDirectory():
          files[filepath] = "0";
          break;
      }
    }

    return files;
  } finally {
    filesync.reloadIgnorePaths();
  }
};

const fileHash = (filepath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(filepath).map((data: Uint8Array) => {
        // windows uses CRLF line endings whereas unix uses LF line
        // endings so we always strip out CR bytes (0x0d) when hashing
        // files. this does make us blind to files that only differ by
        // CR bytes, but that's a tradeoff we're willing to make.
        return data.filter((byte) => byte !== 0x0d);
      });

      const hash = createHash("sha1");
      stream.on("error", (err) => reject(err));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.pipe(hash, { end: false });
    } catch (error) {
      reject(error);
    }
  });
};
