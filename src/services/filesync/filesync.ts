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
import { AppArg } from "../app/arg.js";
import {
  EditGraphQL,
  EditGraphQLError,
  FILE_SYNC_COMPARISON_HASHES_QUERY,
  FILE_SYNC_FILES_QUERY,
  FILE_SYNC_HASHES_QUERY,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../app/edit-graphql.js";
import { ArgError, type ArgsDefinition } from "../command/arg.js";
import type { Context } from "../command/context.js";
import { config, homePath } from "../config/config.js";
import { select } from "../output/prompt.js";
import { sprint } from "../output/sprint.js";
import { getUserOrLogin } from "../user/user.js";
import { sortBySimilar } from "../util/collection.js";
import { noop } from "../util/function.js";
import { isGraphQLErrors, isGraphQLResult, isObject, isString } from "../util/is.js";
import { Changes, printChanges } from "./changes.js";
import { getConflicts, printConflicts, withoutConflictingChanges } from "./conflicts.js";
import { Directory, supportsPermissions, swallowEnoent, type Hashes } from "./directory.js";
import { InvalidSyncFileError, TooManySyncAttemptsError } from "./error.js";
import type { File } from "./file.js";
import { getChanges, isEqualHashes, type ChangesWithHash } from "./hashes.js";

export type FileSyncHashes = {
  inSync: boolean;
  filesVersionHashes: Hashes;
  localHashes: Hashes;
  gadgetHashes: Hashes;
  gadgetFilesVersion: bigint;
};

export class FileSync {
  readonly editGraphQL: EditGraphQL;

  /**
   * A FIFO async callback queue that ensures we process filesync events
   * in the order we receive them.
   */
  private _syncOperations = new PQueue({ concurrency: 1 });

  private constructor(
    /**
     * The {@linkcode Context} that was used to initialize this
     * {@linkcode FileSync} instance.
     */
    readonly ctx: Context<FileSyncArgs>,

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
    private _syncJson: { app: string; filesVersion: string; mtime: number },
  ) {
    this.ctx = ctx.child({ fields: () => ({ filesync: { directory: this.directory.path, filesVersion: this.filesVersion } }) });
    this.editGraphQL = new EditGraphQL(this.ctx, this.app);
  }

  /**
   * The last filesVersion that was written to the filesystem.
   *
   * This determines if the filesystem in Gadget is ahead of the
   * filesystem on the local machine.
   */
  get filesVersion(): bigint {
    return BigInt(this._syncJson.filesVersion);
  }

  /**
   * The largest mtime that was seen on the filesystem.
   *
   * This is used to determine if any files have changed since the last
   * sync. This does not include the mtime of files that are ignored.
   */
  get mtime(): number {
    return this._syncJson.mtime;
  }

  /**
   * Initializes a {@linkcode FileSync} instance.
   * - Ensures the directory exists.
   * - Ensures the directory is empty or contains a `.gadget/sync.json` file (unless `options.force` is `true`)
   * - Ensures an app is specified (either via `options.app` or by prompting the user)
   * - Ensures the specified app matches the app the directory was previously synced to (unless `options.force` is `true`)
   */
  static async init(ctx: Context<FileSyncArgs>): Promise<FileSync> {
    ctx = ctx.child({ name: "filesync" });

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

    let dir = ctx.args._[0];
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

    let appSlug = ctx.args["--app"] || state?.app;
    if (!appSlug) {
      // the user didn't specify an app, suggest some apps that they can sync to
      appSlug = await select(ctx, {
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

    ctx.app = app;
    const directory = await Directory.init(dir);

    if (!state) {
      // the .gadget/sync.json file didn't exist or contained invalid json
      if (wasEmptyOrNonExistent || ctx.args["--force"]) {
        // the directory was empty or the user passed --force
        // either way, create a fresh .gadget/sync.json file
        return new FileSync(ctx, directory, app, { app: app.slug, filesVersion: "0", mtime: 0 });
      }

      // the directory isn't empty and the user didn't pass --force
      throw new InvalidSyncFileError(dir, app.slug);
    }

    // the .gadget/sync.json file exists
    if (state.app === app.slug) {
      // the .gadget/sync.json file is for the same app that the user specified
      return new FileSync(ctx, directory, app, state);
    }

    // the .gadget/sync.json file is for a different app
    if (ctx.args["--force"]) {
      // the user passed --force, so use the app they specified and overwrite everything
      return new FileSync(ctx, directory, app, { app: app.slug, filesVersion: "0", mtime: 0 });
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
    await this._syncOperations.onIdle();
  }

  /**
   * Sends file changes to the Gadget.
   *
   * @param options - The options to use.
   * @param options.changes - The changes to send.
   * @returns A promise that resolves when the changes have been sent.
   */
  async sendChangesToGadget({ changes }: { changes: Changes }): Promise<void> {
    await this._syncOperations.add(async () => {
      try {
        await this._sendChangesToGadget({ changes });
      } catch (error) {
        swallowFilesVersionMismatch(this.ctx, error);
        // we either sent the wrong expectedFilesVersion or we received
        // a filesVersion that is greater than the expectedFilesVersion
        // + 1, so we need to stop what we're doing and get in sync
        await this.sync();
      }
    });
  }

  /**
   * Subscribes to file changes on Gadget and executes the provided
   * callbacks before and after the changes occur.
   *
   * @param options - The options to use.
   * @param options.beforeChanges - A callback that is called before the changes occur.
   * @param options.afterChanges - A callback that is called after the changes occur.
   * @param options.onError - A callback that is called if an error occurs.
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
        this._syncOperations
          .add(async () => {
            if (BigInt(remoteFilesVersion) < this.filesVersion) {
              this.ctx.log.warn("skipping received changes because files version is outdated", { filesVersion: remoteFilesVersion });
              return;
            }

            this.ctx.log.debug("received files", {
              remoteFilesVersion,
              changed: changed.map((change) => change.path),
              deleted: deleted.map((change) => change.path),
            });

            const filterIgnoredFiles = (file: { path: string }): boolean => {
              const ignored = this.directory.ignores(file.path);
              if (ignored) {
                this.ctx.log.warn("skipping received change because file is ignored", { path: file.path });
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
              printChanges(this.ctx, {
                message: sprint`← Received {gray ${dayjs().format("hh:mm:ss A")}}`,
                changes,
                tense: "past",
                limit: 10,
              });
            }

            await afterChanges({ changes });
          })
          .catch(onError);
      },
    });
  }

  /**
   * Ensures the local filesystem is in sync with Gadget's filesystem.
   * - All non-conflicting changes are automatically merged.
   * - Conflicts are resolved by prompting the user to either keep their local changes or keep Gadget's changes.
   * - This function will not return until the filesystem is in sync.
   */
  async sync({ maxAttempts = 10 }: { maxAttempts?: number } = {}): Promise<void> {
    let attempt = 0;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      const { inSync, ...hashes } = await this.hashes();

      if (inSync) {
        this._syncOperations.clear();
        this.ctx.log.info("filesystem is in sync", { attempt });
        await this._save(hashes.gadgetFilesVersion);
        return;
      }

      if (attempt++ >= maxAttempts) {
        throw new TooManySyncAttemptsError(maxAttempts);
      }

      try {
        this.ctx.log.info("syncing", { attempt, ...hashes });
        await this._sync(hashes);
      } catch (error) {
        swallowFilesVersionMismatch(this.ctx, error);
        // we either sent the wrong expectedFilesVersion or we received
        // a filesVersion that is greater than the expectedFilesVersion
        // + 1, so try again
      }
    }
  }

  async _sync({ filesVersionHashes, localHashes, gadgetHashes, gadgetFilesVersion }: Omit<FileSyncHashes, "inSync">): Promise<void> {
    let localChanges = getChanges(this.ctx, { from: filesVersionHashes, to: localHashes, existing: gadgetHashes, ignore: [".gadget/"] });
    let gadgetChanges = getChanges(this.ctx, { from: filesVersionHashes, to: gadgetHashes, existing: localHashes });

    if (localChanges.size === 0 && gadgetChanges.size === 0) {
      // the local filesystem is missing .gadget/ files
      gadgetChanges = getChanges(this.ctx, { from: localHashes, to: gadgetHashes });
      assertAllGadgetFiles({ gadgetChanges });
    }

    assert(localChanges.size > 0 || gadgetChanges.size > 0, "there must be changes if hashes don't match");

    const conflicts = getConflicts({ localChanges, gadgetChanges });
    if (conflicts.size > 0) {
      this.ctx.log.debug("conflicts detected", { conflicts });

      let preference = this.ctx.args["--prefer"];
      if (!preference) {
        printConflicts(this.ctx, {
          message: sprint`{bold You have conflicting changes with Gadget}`,
          conflicts,
        });

        preference = await select(this.ctx, {
          message: "How would you like to resolve these conflicts?",
          choices: Object.values(ConflictPreference),
        });
      }

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

    if (gadgetChanges.size > 0) {
      await this._getChangesFromGadget({ changes: gadgetChanges, filesVersion: gadgetFilesVersion });
    }

    if (localChanges.size > 0) {
      await this._sendChangesToGadget({ changes: localChanges, expectedFilesVersion: gadgetFilesVersion });
    }
  }

  async hashes(): Promise<FileSyncHashes> {
    const [localHashes, { filesVersionHashes, gadgetHashes, gadgetFilesVersion }] = await Promise.all([
      // get the hashes of our local files
      this.directory.hashes(),
      // get the hashes of our local filesVersion and the latest filesVersion
      (async () => {
        let gadgetFilesVersion: bigint;
        let gadgetHashes: Hashes;
        let filesVersionHashes: Hashes;

        if (this.filesVersion === 0n) {
          // this is the first time we're syncing, so just get the
          // hashes of the latest filesVersion
          const { fileSyncHashes } = await this.editGraphQL.query({ query: FILE_SYNC_HASHES_QUERY });
          gadgetFilesVersion = BigInt(fileSyncHashes.filesVersion);
          gadgetHashes = fileSyncHashes.hashes;
          filesVersionHashes = {};
        } else {
          // this isn't the first time we're syncing, so get the hashes
          // of the files at our local filesVersion and the latest
          // filesVersion
          const { fileSyncComparisonHashes } = await this.editGraphQL.query({
            query: FILE_SYNC_COMPARISON_HASHES_QUERY,
            variables: { filesVersion: String(this.filesVersion) },
          });
          gadgetFilesVersion = BigInt(fileSyncComparisonHashes.latestFilesVersionHashes.filesVersion);
          gadgetHashes = fileSyncComparisonHashes.latestFilesVersionHashes.hashes;
          filesVersionHashes = fileSyncComparisonHashes.filesVersionHashes.hashes;
        }

        return { filesVersionHashes, gadgetHashes, gadgetFilesVersion };
      })(),
    ]);

    return {
      filesVersionHashes,
      localHashes,
      gadgetHashes,
      gadgetFilesVersion,
      inSync: isEqualHashes(this.ctx, localHashes, gadgetHashes),
    };
  }

  private async _getChangesFromGadget({
    filesVersion,
    changes,
  }: {
    filesVersion: bigint;
    changes: Changes | ChangesWithHash;
  }): Promise<void> {
    this.ctx.log.debug("getting changes from gadget", { filesVersion, changes });
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

    printChanges(this.ctx, {
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
    this.ctx.log.debug("sending changes to gadget", { expectedFilesVersion, changes });
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
        this.ctx.log.debug("skipping change because file doesn't exist", { path: normalizedPath });
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
      this.ctx.log.debug("skipping send because there are no changes");
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
      http: {
        retry: {
          // we can retry this request because
          // expectedRemoteFilesVersion makes it idempotent
          methods: ["POST"],
          calculateDelay: ({ error, computedValue }) => {
            if (isFilesVersionMismatchError(error.response?.body)) {
              // don't retry if we get a files version mismatch error
              return 0;
            }
            return computedValue;
          },
        },
      },
    });

    printChanges(this.ctx, {
      changes,
      tense: "past",
      message: sprint`→ Sent {gray ${dayjs().format("hh:mm:ss A")}}`,
      limit: printLimit,
    });

    if (BigInt(remoteFilesVersion) > expectedFilesVersion + 1n) {
      // we can't save the remoteFilesVersion because we haven't
      // received the intermediate filesVersions yet
      throw new Error("Files version mismatch");
    }

    await this._save(remoteFilesVersion);
  }

  private async _writeToLocalFilesystem(options: { filesVersion: bigint | string; files: File[]; delete: string[] }): Promise<Changes> {
    const filesVersion = BigInt(options.filesVersion);
    assert(filesVersion >= this.filesVersion, "filesVersion must be greater than or equal to current filesVersion");

    this.ctx.log.debug("writing to local filesystem", {
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
            this.ctx.log.warn("failed to move file to backup", { error, currentPath, backupPath });
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

  /**
   * Updates {@linkcode _syncJson} and saves it to `.gadget/sync.json`.
   */
  private async _save(filesVersion: string | bigint): Promise<void> {
    this._syncJson = { ...this._syncJson, mtime: Date.now() + 1, filesVersion: String(filesVersion) };
    this.ctx.log.debug("saving .gadget/sync.json");
    await fs.outputJSON(this.directory.absolute(".gadget/sync.json"), this._syncJson, { spaces: 2 });
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
  assert(
    gadgetChanges.created().length > 0 || gadgetChanges.deleted().length > 0 || gadgetChanges.updated().length > 0,
    "expected gadgetChanges to have changes",
  );

  const allGadgetFiles = Array.from(gadgetChanges.keys()).every((path) => path.startsWith(".gadget/"));
  assert(allGadgetFiles, "expected all gadgetChanges to be .gadget/ files");
};

export const ConflictPreference = Object.freeze({
  CANCEL: "Cancel (Ctrl+C)",
  LOCAL: "Keep my conflicting changes",
  GADGET: "Keep Gadget's conflicting changes",
});

export type ConflictPreference = (typeof ConflictPreference)[keyof typeof ConflictPreference];

export const ConflictPreferenceArg = (value: string, name: string): ConflictPreference => {
  if (["local", "gadget"].includes(value)) {
    return ConflictPreference[value.toUpperCase() as keyof typeof ConflictPreference];
  }

  throw new ArgError(sprint`
      ${name} must be {bold local} or {bold gadget}

      {bold EXAMPLES:}
        ${name} local
        ${name} gadget
    `);
};

export const FileSyncArgs = {
  "--app": { type: AppArg, alias: "-a" },
  "--prefer": ConflictPreferenceArg,
  "--force": Boolean,
} satisfies ArgsDefinition;

export type FileSyncArgs = typeof FileSyncArgs;

export const isFilesVersionMismatchError = (error: unknown): boolean => {
  if (error instanceof EditGraphQLError) {
    error = error.cause;
  }
  if (isGraphQLResult(error)) {
    error = error.errors;
  }
  if (isGraphQLErrors(error)) {
    error = error[0];
  }
  return isObject(error) && "message" in error && isString(error.message) && error.message.startsWith("Files version mismatch");
};

const swallowFilesVersionMismatch = (ctx: Context, error: unknown): void => {
  if (isFilesVersionMismatchError(error)) {
    ctx.log.debug("swallowing files version mismatch", { error });
    return;
  }
  throw error;
};
