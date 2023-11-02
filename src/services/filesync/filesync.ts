import { findUp } from "find-up";
import fs from "fs-extra";
import ms from "ms";
import path from "node:path";
import process from "node:process";
import pMap from "p-map";
import pRetry from "p-retry";
import { z } from "zod";
import { FileSyncEncoding, type FileSyncChangedEventInput, type FileSyncDeletedEventInput } from "../../__generated__/graphql.js";
import type { App } from "../app.js";
import { getApps } from "../app.js";
import { mapValues } from "../collections.js";
import { config } from "../config.js";
import {
  EditGraphQL,
  FILES_QUERY,
  FILE_HASHES_QUERY,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../edit-graphql.js";
import { ArgError, InvalidSyncFileError } from "../errors.js";
import { isEmptyOrNonExistentDir, swallowEnoent } from "../fs.js";
import { createLogger } from "../log.js";
import { noop } from "../noop.js";
import { sortBySimilarity, sprint } from "../print.js";
import { select } from "../prompt.js";
import type { User } from "../user.js";
import { Changes, Create, Delete, Update, type Change } from "./changes.js";
import { Directory } from "./directory.js";
import { Hashes, type ChangesWithHash } from "./hashes.js";

const log = createLogger("filesync");

export type File = {
  path: string;
  oldPath?: string;
  mode: number;
  content: string;
  encoding: FileSyncEncoding;
};

export class FileSync {
  readonly editGraphQL: EditGraphQL;

  private constructor(
    /**
     * The directory that is being synced to.
     */
    readonly directory: Directory,

    /**
     * The Gadget application that is being synced to.
     */
    readonly app: App,

    /**
     * The state of the filesystem.
     *
     * This is persisted to `.gadget/sync.json` within the {@linkcode directory}.
     */
    private _state: { app: string; filesVersion: string; mtime: number },
  ) {
    this._save();
    this.editGraphQL = new EditGraphQL(this.app);
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
  static async init(options: { user: User; dir?: string; app?: string; force?: boolean; extraIgnorePaths?: string[] }): Promise<FileSync> {
    const apps = await getApps(options.user);
    if (apps.length === 0) {
      throw new ArgError(
        sprint`
          You (${options.user.email}) don't have have any Gadget applications.

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

    const isEmpty = await isEmptyOrNonExistentDir(dir);
    const directory = new Directory(dir, isEmpty);

    if (!state) {
      // the .gadget/sync.json file didn't exist or contained invalid json
      if (isEmpty || options.force) {
        // the directory is empty or the user passed --force
        // either way, create a fresh .gadget/sync.json file
        return new FileSync(directory, app, { app: app.slug, filesVersion: "0", mtime: 0 });
      }

      // the directory isn't empty and the user didn't pass --force
      throw new InvalidSyncFileError(dir, app.slug);
    }

    // the .gadget/sync.json file exists
    if (state.app === app.slug) {
      // the .gadget/sync.json file is for the same app that the user specified
      return new FileSync(directory, app, state);
    }

    // the .gadget/sync.json file is for a different app
    if (options.force) {
      // the user passed --force, so use the app they specified and overwrite everything
      return new FileSync(directory, app, { app: app.slug, filesVersion: "0", mtime: 0 });
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

  async writeToLocalFilesystem(options: {
    filesVersion: bigint | string;
    files: Iterable<File>;
    delete: Iterable<string>;
    force?: boolean;
  }): Promise<Changes> {
    const filesVersion = BigInt(options.filesVersion);
    const created: string[] = [];
    const updated: string[] = [];

    await pMap(options.delete, async (filepath) => {
      const currentPath = this.directory.absolute(filepath);
      const backupPath = this.directory.absolute(".gadget/backup", this.directory.relative(filepath));

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
      const absolutePath = this.directory.absolute(file.path);
      if (await fs.pathExists(absolutePath)) {
        updated.push(file.path);
      } else {
        created.push(file.path);
      }

      if (file.path.endsWith("/")) {
        await fs.ensureDir(absolutePath, { mode: 0o755 });
        return;
      }

      await fs.ensureDir(path.dirname(absolutePath), { mode: 0o755 });
      await fs.writeFile(absolutePath, Buffer.from(file.content, file.encoding), { mode: file.mode });

      if (absolutePath === this.directory.absolute(".ignore")) {
        this.directory.loadIgnoreFile();
      }
    });

    this._state.mtime = Date.now();
    if (filesVersion > BigInt(this._state.filesVersion) || options.force) {
      this._state.filesVersion = String(filesVersion);
    }

    this._save();

    return new Changes<Change>([
      ...created.map((path) => [path, new Create()] as const),
      ...updated.map((path) => [path, new Update()] as const),
      ...Array.from(options.delete).map((path) => [path, new Delete()] as const),
    ]);
  }

  async sendChangesToGadget({
    expectedFilesVersion = this.filesVersion,
    changes,
  }: {
    expectedFilesVersion?: bigint;
    changes: Changes | ChangesWithHash;
  }): Promise<void> {
    const changed: FileSyncChangedEventInput[] = [];
    const deleted: FileSyncDeletedEventInput[] = [];

    await pMap(changes, async ([normalizedPath, change]) => {
      if (change instanceof Delete) {
        deleted.push({ path: normalizedPath });
        return;
      }

      const absolutePath = this.directory.absolute(normalizedPath);
      const stats = await fs.stat(absolutePath);

      let content = "";
      if (stats.isFile()) {
        content = await fs.readFile(absolutePath, FileSyncEncoding.Base64);
      }

      let oldPath;
      if (change instanceof Create && change.oldPath) {
        oldPath = change.oldPath;
      }

      changed.push({
        content,
        oldPath,
        path: normalizedPath,
        mode: stats.mode,
        encoding: FileSyncEncoding.Base64,
      });
    });

    const { publishFileSyncEvents } = await this.editGraphQL.query({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      variables: {
        input: {
          expectedRemoteFilesVersion: String(expectedFilesVersion),
          changed,
          deleted,
        },
      },
    });

    this._state.filesVersion = publishFileSyncEvents.remoteFilesVersion;
    this._save();
  }

  receiveChangesFromGadget({
    onChange,
    onError,
  }: {
    onChange: (changes: { filesVersion: bigint; changed: File[]; deleted: string[] }) => void;
    onError: (error: unknown) => void;
  }): () => void {
    return this.editGraphQL.subscribe(
      {
        query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
        // the reason this is a function rather than a static value is
        // so that it will be re-evaluated if the connection is lost and
        // then re-established. this ensures that we send our current
        // filesVersion rather than the one that was sent when we
        // started
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

          onChange({
            filesVersion: BigInt(remoteFileSyncEvents.remoteFilesVersion),
            changed: remoteFileSyncEvents.changed,
            deleted: mapValues(remoteFileSyncEvents.deleted, "path"),
          });
        },
      },
    );
  }

  async getHashes(): Promise<{
    gadgetFilesVersion: bigint;
    filesVersionHashes: Hashes;
    localHashes: Hashes;
    gadgetHashes: Hashes;
  }> {
    const [localHashes, filesVersionHashes, { gadgetFilesVersion, gadgetHashes }] = await Promise.all([
      // get the hashes of our local files
      this.directory.hashes(),
      // get the hashes of the files at our current filesVersion
      this.editGraphQL
        .query({ query: FILE_HASHES_QUERY, variables: { filesVersion: String(this.filesVersion) } })
        .then((data) => Hashes.parse(data.fileHashes.hashes)),
      // get the hashes of the files at the latest filesVersion
      this.editGraphQL.query({ query: FILE_HASHES_QUERY }).then((data) => ({
        gadgetFilesVersion: BigInt(data.fileHashes.filesVersion),
        gadgetHashes: Hashes.parse(data.fileHashes.hashes),
      })),
    ]);

    const hashes = { filesVersionHashes, localHashes, gadgetHashes, gadgetFilesVersion };
    // await fs.outputJSON("tmp/hashes.json", { ...hashes, gadgetFilesVersion: String(gadgetFilesVersion) }, { spaces: 2 });

    return hashes;
  }

  async getFilesFromGadget({
    filesVersion,
    paths,
  }: {
    filesVersion?: bigint;
    paths: string[];
  }): Promise<{ filesVersion: bigint; files: File[] }> {
    const data = await this.editGraphQL.query({
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

  /**
   * Synchronously writes {@linkcode _state} to `.gadget/sync.json`.
   */
  private _save(): void {
    fs.outputJSONSync(this.directory.absolute(".gadget/sync.json"), this._state, { spaces: 2 });
  }
}
