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
import { printTable, sortBySimilarity, sprint } from "./print.js";
import { select } from "./prompt.js";
import type { User } from "./user.js";

const log = createLogger("filesync");

const ALWAYS_IGNORE_PATHS = [".DS_Store", "node_modules", ".git"] as const;

export type File = {
  path: string;
  oldPath?: string;
  mode: number;
  content: string;
  encoding: FileSyncEncoding;
};

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
  }): Promise<FileChange[]> {
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

    const changes = [
      ...added.map((path) => new Add(path)),
      ...changed.map((path) => new Change(path)),
      ...Array.from(options.delete).map((path) => new Delete(path)),
    ];

    // log.info("wrote", { ...this._state, changes });

    return changes;
  }

  async sendChangesToGadget(changes: { changed: Iterable<File>; deleted: Iterable<string> }): Promise<FileChange[]> {
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

    return [
      ...mapValues(changes.changed, "path").map((path) => new Add(path)),
      ...Array.from(changes.deleted).map((path) => new Delete(path)),
    ].sort((a, b) => a.path.localeCompare(b.path));
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

  async hashes(): Promise<{
    /**
     * The latest filesVersion in Gadget.
     */
    gadgetFilesVersion: bigint;
    filesVersionHashes: Hashes;
    localHashes: Hashes;
    gadgetHashes: Hashes;
  }> {
    const [localHashes, [, filesVersionHashes], [gadgetFilesVersion, gadgetHashes]] = await Promise.all([
      fileHashes(this),
      gadgetFileHashes(this._editGraphQL, this.filesVersion),
      gadgetFileHashes(this._editGraphQL),
    ]);

    return {
      gadgetFilesVersion: BigInt(gadgetFilesVersion),
      filesVersionHashes,
      localHashes,
      gadgetHashes,
    };

    //  The changes that have been made to the local filesystem since the last time we synced.
    // localChanges: new ChangedHashes({ from: filesVersionHashes, to: localHashes }),

    // The changes that have been made to Gadget since the last time we synced.
    // gadgetChanges: new ChangedHashes({ from: filesVersionHashes, to: gadgetHashes }),

    // The files that need to be changed on the local filesystem to match Gadget.
    // localToGadget: new FilesToChange({ from: localHashes, to: gadgetHashes }),

    // The files that need to be changed in Gadget to match the local filesystem.
    // gadgetToLocal: new FilesToChange({ from: gadgetHashes, to: localHashes }),
  }

  /**
   * Synchronously writes {@linkcode _state} to `.gadget/sync.json`.
   */
  private _save(): void {
    fs.outputJSONSync(this.absolute(".gadget/sync.json"), this._state, { spaces: 2 });
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

const chalkAdd = chalk.greenBright("add");
const chalkChange = chalk.blueBright("change");
const chalkDelete = chalk.redBright("delete");

const chalkAdded = chalk.greenBright("added");
const chalkChanged = chalk.blueBright("changed");
const chalkDeleted = chalk.redBright("deleted");

export const getChanges = ({ from, to }: { from: Hashes; to: Hashes }): FileChangeWithHash[] => {
  const added: AddWithHash[] = [];
  const changed: ChangeWithHash[] = [];
  const deleted: DeleteWithHash[] = [];

  const toPaths = Object.keys(to);

  for (const [fromPath, fromHash] of Object.entries(from)) {
    const toHash = to[fromPath];
    if (!toHash) {
      if (!fromPath.endsWith("/") || !toPaths.some((toPath) => toPath.startsWith(fromPath))) {
        // fromPath is a file and it doesn't exist in to OR fromPath
        // is a directory and to doesn't have any existing files
        // inside it, therefor the fromPath has been deleted
        deleted.push(new DeleteWithHash(fromPath, fromHash));
      }
    } else if (toHash !== fromHash) {
      // the file or directory exists in to, but has a different
      // hash, so it's been changed
      changed.push(new ChangeWithHash(fromPath, fromHash, toHash));
    }
  }

  for (const toPath of toPaths) {
    if (!from[toPath]) {
      // the toPath doesn't exist in from, so it's been added
      const toHash = to[toPath];
      assert(toHash);
      added.push(new AddWithHash(toPath, toHash));
    }
  }

  return [...added, ...changed, ...deleted].sort((a, b) => a.path.localeCompare(b.path));
};

export const printChanges = ({ changes, tense = "present" }: { changes: FileChange[]; tense?: "past" | "present" }): void => {
  const added = tense === "past" ? chalkAdded : chalkAdd;
  const changed = tense === "past" ? chalkChanged : chalkChange;
  const deleted = tense === "past" ? chalkDeleted : chalkDelete;

  printTable({
    colAligns: ["left", "left", "center"],
    head: ["", "", ""],
    rows: changes.map((change) => {
      switch (change.type) {
        case "add":
          return [chalk.greenBright("+"), chalk.greenBright(change.path), added];
        case "change":
          return [chalk.blueBright("+-"), chalk.blueBright(change.path), changed];
        case "delete":
          return [chalk.redBright("-"), chalk.redBright(change.path), deleted];
      }
    }),
  });
};

export const getConflicts = ({
  yourChanges,
  theirChanges,
}: {
  yourChanges: FileChangeWithHash[];
  theirChanges: FileChangeWithHash[];
}): FileConflict[] => {
  const conflicts = [];

  for (const yourChange of yourChanges) {
    const theirChange = theirChanges.find((theirChange) => theirChange.path === yourChange.path);
    if (!theirChange) {
      continue;
    }

    if ("toHash" in yourChange && "toHash" in theirChange && yourChange.toHash === theirChange.toHash) {
      continue;
    }

    switch (true) {
      case yourChange.type === "add" && theirChange.type === "add":
        conflicts.push(new YouAddedTheyAdded(yourChange.path));
        break;
      case yourChange.type === "add" && theirChange.type === "change":
        conflicts.push(new YouAddedTheyChanged(yourChange.path));
        break;
      case yourChange.type === "add" && theirChange.type === "delete":
        conflicts.push(new YouAddedTheyDeleted(yourChange.path));
        break;
      case yourChange.type === "change" && theirChange.type === "add":
        conflicts.push(new YouChangedTheyAdded(yourChange.path));
        break;
      case yourChange.type === "change" && theirChange.type === "change":
        conflicts.push(new YouChangedTheyChanged(yourChange.path));
        break;
      case yourChange.type === "change" && theirChange.type === "delete":
        conflicts.push(new YouChangedTheyDeleted(yourChange.path));
        break;
      case yourChange.type === "delete" && theirChange.type === "add":
        conflicts.push(new YouDeletedTheyAdded(yourChange.path));
        break;
      case yourChange.type === "delete" && theirChange.type === "change":
        conflicts.push(new YouDeletedTheyChanged(yourChange.path));
        break;
    }
  }

  return conflicts;
};

export const printConflicts = (conflicts: FileConflict[]): void => {
  printTable({
    chars: { "top-mid": " " },
    colAligns: ["left", "center", "center"],
    head: ["Path", "You", "Gadget"],
    rows: conflicts.map((conflict) => {
      switch (conflict.type) {
        case "youAddedTheyAdded":
          return [conflict.path, chalkAdded, chalkAdded];
        case "youAddedTheyChanged":
          return [conflict.path, chalkAdded, chalkChanged];
        case "youAddedTheyDeleted":
          return [conflict.path, chalkAdded, chalkDeleted];
        case "youChangedTheyAdded":
          return [conflict.path, chalkChanged, chalkAdded];
        case "youChangedTheyChanged":
          return [conflict.path, chalkChanged, chalkChanged];
        case "youChangedTheyDeleted":
          return [conflict.path, chalkChanged, chalkDeleted];
        case "youDeletedTheyAdded":
          return [conflict.path, chalkDeleted, chalkAdded];
        case "youDeletedTheyChanged":
          return [conflict.path, chalkDeleted, chalkChanged];
      }
    }),
  });
};

export const getNecessaryChanges = ({ changes, existing }: { changes: FileChangeWithHash[]; existing: Hashes }): FileChangeWithHash[] => {
  return changes.filter((change) => {
    const hash = existing[change.path];
    if (change.type === "delete" && !hash) {
      // already deleted
      return false;
    }
    if ((change.type === "add" || change.type === "change") && change.toHash === hash) {
      // already added or changed
      return false;
    }
    return true;
  });
};

export type FileChange = Add | Change | Delete;
type FileChangeWithHash = AddWithHash | ChangeWithHash | DeleteWithHash;
type FileConflict =
  | YouAddedTheyAdded
  | YouAddedTheyChanged
  | YouAddedTheyDeleted
  | YouChangedTheyAdded
  | YouChangedTheyChanged
  | YouChangedTheyDeleted
  | YouDeletedTheyAdded
  | YouDeletedTheyChanged;

class Add {
  type = "add" as const;
  constructor(readonly path: string) {}
}

class AddWithHash extends Add {
  constructor(
    path: string,
    readonly toHash: string,
  ) {
    super(path);
  }
}

class Change {
  type = "change" as const;
  constructor(readonly path: string) {}
}

class ChangeWithHash extends Change {
  constructor(
    path: string,
    readonly fromHash: string,
    readonly toHash: string,
  ) {
    super(path);
  }
}

class Delete {
  type = "delete" as const;
  constructor(readonly path: string) {}
}

class DeleteWithHash extends Delete {
  constructor(
    path: string,
    readonly fromHash: string,
  ) {
    super(path);
  }
}

class YouAddedTheyAdded {
  type = "youAddedTheyAdded" as const;
  constructor(readonly path: string) {}
}

class YouAddedTheyChanged {
  type = "youAddedTheyChanged" as const;
  constructor(readonly path: string) {}
}

class YouAddedTheyDeleted {
  type = "youAddedTheyDeleted" as const;
  constructor(readonly path: string) {}
}

class YouChangedTheyAdded {
  type = "youChangedTheyAdded" as const;
  constructor(readonly path: string) {}
}

class YouChangedTheyChanged {
  type = "youChangedTheyChanged" as const;
  constructor(readonly path: string) {}
}

class YouChangedTheyDeleted {
  type = "youChangedTheyDeleted" as const;
  constructor(readonly path: string) {}
}

class YouDeletedTheyAdded {
  type = "youDeletedTheyAdded" as const;
  constructor(readonly path: string) {}
}

class YouDeletedTheyChanged {
  type = "youDeletedTheyChanged" as const;
  constructor(readonly path: string) {}
}
