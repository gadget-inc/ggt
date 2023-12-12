import dayjs from "dayjs";
import { findUp } from "find-up";
import fs from "fs-extra";
import ms from "ms";
import assert from "node:assert";
import path from "node:path";
import process from "node:process";
import pMap from "p-map";
import PQueue from "p-queue";
import pRetry from "p-retry";
import type { Promisable } from "type-fest";
import { z } from "zod";
import { FileSyncEncoding, type FileSyncChangedEventInput, type FileSyncDeletedEventInput } from "../../__generated__/graphql.js";
import type { App } from "../app/app.js";
import { getApps } from "../app/app.js";
import {
  EditGraphQL,
  FILE_SYNC_FILES_QUERY,
  FILE_SYNC_HASHES_QUERY,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../app/edit-graphql.js";
import { ArgError } from "../command/arg.js";
import { config, homePath } from "../config/config.js";
import { createLogger } from "../output/log/logger.js";
import { select } from "../output/prompt.js";
import { sprint } from "../output/sprint.js";
import type { User } from "../user/user.js";
import { sortBySimilar } from "../util/collection.js";
import { noop } from "../util/function.js";
import { Changes, printChanges } from "./changes.js";
import { getConflicts, printConflicts, withoutConflictingChanges } from "./conflicts.js";
import { Directory, supportsPermissions, swallowEnoent, type Hashes } from "./directory.js";
import { InvalidSyncFileError, TooManySyncAttemptsError } from "./error.js";
import type { File } from "./file.js";
import { getChanges, isEqualHashes, withoutUnnecessaryChanges, type ChangesWithHash } from "./hashes.js";

export class FileSync {
  readonly editGraphQL: EditGraphQL;

  readonly log = createLogger({ name: "filesync", fields: () => ({ state: this._state }) });

  /**
   * A FIFO async callback queue that ensures we process filesync events
   * in the order we receive them.
   */
  private _queue = new PQueue({ concurrency: 1 });

  private constructor(
    /**
     * The directory that is being synced to.
     */
    readonly directory: Directory,

    /**
     * Whether the directory was empty or non-existent when we started.
     */
    readonly wasEmptyOrNonExistent: boolean,

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
  static async init(options: { user: User; dir?: string; app?: string; force?: boolean }): Promise<FileSync> {
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
      dir = homePath(dir.slice(2));
    }

    // ensure the root directory is an absolute path and exists
    const wasEmptyOrNonExistent = await isEmptyOrNonExistentDir(dir);
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
        message: "Select the app to sync to",
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
        sprint`
        Unknown application:

          ${appSlug}

        Did you mean one of these?


      `.concat(`  • ${similarAppSlugs.join("\n  • ")}`),
      );
    }

    const directory = await Directory.init(dir);

    if (!state) {
      // the .gadget/sync.json file didn't exist or contained invalid json
      if (wasEmptyOrNonExistent || options.force) {
        // the directory was empty or the user passed --force
        // either way, create a fresh .gadget/sync.json file
        return new FileSync(directory, wasEmptyOrNonExistent, app, { app: app.slug, filesVersion: "0", mtime: 0 });
      }

      // the directory isn't empty and the user didn't pass --force
      throw new InvalidSyncFileError(dir, app.slug);
    }

    // the .gadget/sync.json file exists
    if (state.app === app.slug) {
      // the .gadget/sync.json file is for the same app that the user specified
      return new FileSync(directory, wasEmptyOrNonExistent, app, state);
    }

    // the .gadget/sync.json file is for a different app
    if (options.force) {
      // the user passed --force, so use the app they specified and overwrite everything
      return new FileSync(directory, wasEmptyOrNonExistent, app, { app: app.slug, filesVersion: "0", mtime: 0 });
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
   * Waits for all pending and ongoing filesync operations to complete.
   */
  async idle(): Promise<void> {
    await this._queue.onIdle();
  }

  /**
   * Sends file changes to the Gadget.
   *
   * @param changes - The changes to send.
   * @returns A promise that resolves when the changes have been sent.
   */
  async sendChangesToGadget({ changes }: { changes: Changes }): Promise<void> {
    await this._enqueue(() => this._sendChangesToGadget({ changes }));
  }

  /**
   * Subscribes to file changes on Gadget and executes the provided
   * callbacks before and after the changes occur.
   *
   * @returns A function that unsubscribes from changes on Gadget.
   */
  subscribeToGadgetChanges({
    beforeChanges,
    afterChanges,
    onError,
  }: {
    beforeChanges: (data: { changed: string[]; deleted: string[] }) => Promisable<void>;
    afterChanges: (data: { changes: Changes }) => Promisable<void>;
    onError: (error: unknown) => void;
  }): () => void {
    return this.editGraphQL.subscribe({
      query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      // the reason this is a function rather than a static value is
      // so that it will be re-evaluated if the connection is lost and
      // then re-established. this ensures that we send our current
      // filesVersion rather than the one that was sent when we first
      // subscribed
      variables: () => ({ localFilesVersion: String(this.filesVersion) }),
      onError,
      onData: ({ remoteFileSyncEvents: { changed, deleted, remoteFilesVersion } }) => {
        this._enqueue(async () => {
          if (BigInt(remoteFilesVersion) < this.filesVersion) {
            this.log.warn("skipping received changes because files version is outdated", { filesVersion: remoteFilesVersion });
            return;
          }

          this.log.debug("received files", {
            remoteFilesVersion: remoteFilesVersion,
            changed: changed.map((change) => change.path),
            deleted: deleted.map((change) => change.path),
          });

          const filterIgnoredFiles = (file: { path: string }): boolean => {
            const ignored = this.directory.ignores(file.path);
            if (ignored) {
              this.log.warn("skipping received change because file is ignored", { path: file.path });
            }
            return !ignored;
          };

          changed = changed.filter(filterIgnoredFiles);
          deleted = deleted.filter(filterIgnoredFiles);

          if (changed.length === 0 && deleted.length === 0) {
            await this._save(remoteFilesVersion);
            return;
          }

          await beforeChanges({
            changed: changed.map((file) => file.path),
            deleted: deleted.map((file) => file.path),
          });

          const changes = await this._writeToLocalFilesystem({
            filesVersion: remoteFilesVersion,
            files: changed,
            delete: deleted.map((file) => file.path),
          });

          if (changes.size > 0) {
            printChanges({
              message: sprint`← Received {gray ${dayjs().format("hh:mm:ss A")}}`,
              changes,
              tense: "past",
              limit: 10,
            });
          }

          await afterChanges({ changes });
        }).catch(onError);
      },
    });
  }

  /**
   * Ensures the local filesystem is in sync with Gadget's filesystem.
   * - All non-conflicting changes are automatically merged.
   * - Conflicts are resolved by prompting the user to either keep their
   *   local changes or keep Gadget's changes.
   * - This function will not return until the filesystem is in sync.
   */
  async sync({ attempt = 0 }: { attempt?: number } = {}): Promise<void> {
    if (attempt > 10) {
      throw new TooManySyncAttemptsError(attempt);
    }

    const { filesVersionHashes, localHashes, gadgetHashes, gadgetFilesVersion } = await this._getHashes();
    this.log.debug("syncing", { filesVersionHashes, localHashes, gadgetHashes, gadgetFilesVersion });

    if (isEqualHashes(localHashes, gadgetHashes)) {
      this.log.info("filesystem is in sync");
      await this._save(gadgetFilesVersion);
      return;
    }

    let localChanges = getChanges({ from: filesVersionHashes, to: localHashes, ignore: [".gadget/"] });
    let gadgetChanges = getChanges({ from: filesVersionHashes, to: gadgetHashes });

    if (localChanges.size === 0 && gadgetChanges.size === 0) {
      // the local filesystem is missing .gadget/ files
      gadgetChanges = getChanges({ from: localHashes, to: gadgetHashes });
      assertAllGadgetFiles({ gadgetChanges });
    }

    const conflicts = getConflicts({ localChanges, gadgetChanges });
    if (conflicts.size > 0) {
      this.log.debug("conflicts detected", { conflicts });
      printConflicts({
        message: sprint`{bold You have conflicting changes with Gadget}`,
        conflicts,
      });

      const preference = await select({
        message: "How would you like to resolve these conflicts?",
        choices: Object.values(ConflictPreference),
      });

      switch (preference) {
        case ConflictPreference.CANCEL: {
          process.exit(0);
          break;
        }
        case ConflictPreference.LOCAL: {
          gadgetChanges = withoutConflictingChanges({ conflicts, changes: gadgetChanges });
          break;
        }
        case ConflictPreference.GADGET: {
          localChanges = withoutConflictingChanges({ conflicts, changes: localChanges });
          break;
        }
      }
    }

    localChanges = withoutUnnecessaryChanges({ changes: localChanges, existing: gadgetHashes });
    gadgetChanges = withoutUnnecessaryChanges({ changes: gadgetChanges, existing: localHashes });

    assert(localChanges.size > 0 || gadgetChanges.size > 0, "there must be changes if hashes don't match");

    if (gadgetChanges.size > 0) {
      await this._getChangesFromGadget({ changes: gadgetChanges, filesVersion: gadgetFilesVersion });
    }

    if (localChanges.size > 0) {
      await this._sendChangesToGadget({ changes: localChanges, expectedFilesVersion: gadgetFilesVersion });
    }

    // recursively call this function until we're in sync
    return this.sync({ attempt: ++attempt });
  }

  private async _getChangesFromGadget({
    filesVersion,
    changes,
  }: {
    filesVersion: bigint;
    changes: Changes | ChangesWithHash;
  }): Promise<void> {
    this.log.debug("getting changes from gadget", { filesVersion, changes });
    const created = changes.created();
    const updated = changes.updated();

    let files: File[] = [];
    if (created.length > 0 || updated.length > 0) {
      const { fileSyncFiles } = await this.editGraphQL.query({
        query: FILE_SYNC_FILES_QUERY,
        variables: {
          paths: [...created, ...updated],
          filesVersion: String(filesVersion),
          encoding: FileSyncEncoding.Base64,
        },
      });

      files = fileSyncFiles.files;
    }

    await this._writeToLocalFilesystem({
      filesVersion,
      files,
      delete: changes.deleted(),
    });

    printChanges({
      changes,
      tense: "past",
      message: sprint`← Received {gray ${dayjs().format("hh:mm:ss A")}}`,
    });
  }

  private async _sendChangesToGadget({
    expectedFilesVersion = this.filesVersion,
    changes,
    printLimit,
  }: {
    expectedFilesVersion?: bigint;
    changes: Changes;
    printLimit?: number;
  }): Promise<void> {
    this.log.debug("sending changes to gadget", { expectedFilesVersion, changes });
    const changed: FileSyncChangedEventInput[] = [];
    const deleted: FileSyncDeletedEventInput[] = [];

    await pMap(changes, async ([normalizedPath, change]) => {
      if (change.type === "delete") {
        deleted.push({ path: normalizedPath });
        return;
      }

      const absolutePath = this.directory.absolute(normalizedPath);

      let stats;
      try {
        stats = await fs.stat(absolutePath);
      } catch (error) {
        swallowEnoent(error);
        this.log.debug("skipping change because file doesn't exist", { path: normalizedPath });
        return;
      }

      let content = "";
      if (stats.isFile()) {
        content = await fs.readFile(absolutePath, FileSyncEncoding.Base64);
      }

      let oldPath;
      if (change.type === "create" && change.oldPath) {
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

    if (changed.length === 0 && deleted.length === 0) {
      this.log.debug("skipping send because there are no changes");
      return;
    }

    const {
      publishFileSyncEvents: { remoteFilesVersion },
    } = await this.editGraphQL.query({
      query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      variables: {
        input: {
          expectedRemoteFilesVersion: String(expectedFilesVersion),
          changed,
          deleted,
        },
      },
    });

    await this._save(remoteFilesVersion);

    printChanges({
      changes,
      tense: "past",
      message: sprint`→ Sent {gray ${dayjs().format("hh:mm:ss A")}}`,
      limit: printLimit,
    });
  }

  private async _writeToLocalFilesystem(options: { filesVersion: bigint | string; files: File[]; delete: string[] }): Promise<Changes> {
    const filesVersion = BigInt(options.filesVersion);
    assert(filesVersion >= this.filesVersion, "filesVersion must be greater than or equal to current filesVersion");

    this.log.debug("writing to local filesystem", {
      filesVersion,
      files: options.files.map((file) => file.path),
      delete: options.delete,
    });

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
            this.log.warn("failed to move file to backup", { error, currentPath, backupPath });
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
        await fs.ensureDir(absolutePath);
      } else {
        await fs.outputFile(absolutePath, Buffer.from(file.content, file.encoding));
      }

      if (supportsPermissions) {
        // the os's default umask makes setting the mode during creation
        // not work, so an additional fs.chmod call is necessary to
        // ensure the file has the correct mode
        await fs.chmod(absolutePath, file.mode & 0o777);
      }

      if (absolutePath === this.directory.absolute(".ignore")) {
        await this.directory.loadIgnoreFile();
      }
    });

    await this._save(String(filesVersion));

    return new Changes([
      ...created.map((path) => [path, { type: "create" }] as const),
      ...updated.map((path) => [path, { type: "update" }] as const),
      ...options.delete.map((path) => [path, { type: "delete" }] as const),
    ]);
  }

  private async _getHashes(): Promise<{
    gadgetFilesVersion: bigint;
    filesVersionHashes: Hashes;
    localHashes: Hashes;
    gadgetHashes: Hashes;
  }> {
    const [localHashes, filesVersionHashes, { gadgetFilesVersion, gadgetHashes }] = await Promise.all([
      // get the hashes of our local files
      this.directory.hashes(),
      // get the hashes of the files at our current filesVersion
      this.filesVersion === 0n
        ? {}
        : this.editGraphQL
            .query({ query: FILE_SYNC_HASHES_QUERY, variables: { filesVersion: String(this.filesVersion) } })
            .then((data) => data.fileSyncHashes.hashes),
      // get the hashes of the files at the latest filesVersion
      this.editGraphQL.query({ query: FILE_SYNC_HASHES_QUERY }).then((data) => ({
        gadgetFilesVersion: BigInt(data.fileSyncHashes.filesVersion),
        gadgetHashes: data.fileSyncHashes.hashes,
      })),
    ]);

    return { filesVersionHashes, localHashes, gadgetHashes, gadgetFilesVersion };
  }

  /**
   * Updates {@linkcode _state} and saves it to `.gadget/sync.json`.
   */
  private async _save(filesVersion: string | bigint): Promise<void> {
    this._state = { ...this._state, mtime: Date.now() + 1, filesVersion: String(filesVersion) };
    this.log.debug("saving state", { state: this._state });
    await fs.outputJSON(this.directory.absolute(".gadget/sync.json"), this._state, { spaces: 2 });
  }

  /**
   * Enqueues a function that handles filesync events onto the {@linkcode _queue}.
   */
  private _enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this._queue.add(fn) as Promise<T>;
  }
}

/**
 * Checks if a directory is empty or non-existent.
 *
 * @param dir - The directory path to check.
 * @returns A Promise that resolves to a boolean indicating whether the directory is empty or non-existent.
 */
export const isEmptyOrNonExistentDir = async (dir: string): Promise<boolean> => {
  try {
    for await (const _ of await fs.opendir(dir, { bufferSize: 1 })) {
      return false;
    }
    return true;
  } catch (error) {
    swallowEnoent(error);
    return true;
  }
};

export const assertAllGadgetFiles = ({ gadgetChanges }: { gadgetChanges: Changes }): void => {
  assert(gadgetChanges.created().length > 0, "expected gadgetChanges to have created files");
  assert(gadgetChanges.deleted().length === 0, "expected gadgetChanges to not have deleted files");
  assert(gadgetChanges.updated().length === 0, "expected gadgetChanges to not have updated files");

  const allGadgetFiles = Array.from(gadgetChanges.keys()).every((path) => path.startsWith(".gadget/"));
  assert(allGadgetFiles, "expected all gadgetChanges to be .gadget/ files");
};

export const ConflictPreference = Object.freeze({
  CANCEL: "Cancel (Ctrl+C)",
  LOCAL: "Keep my conflicting changes",
  GADGET: "Keep Gadget's conflicting changes",
});
