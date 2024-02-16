import dayjs from "dayjs";
import { execa } from "execa";
import fs from "fs-extra";
import ms from "ms";
import assert from "node:assert";
import process from "node:process";
import pMap from "p-map";
import PQueue from "p-queue";
import pRetry from "p-retry";
import type { Promisable } from "type-fest";
import { FileSyncEncoding, type FileSyncChangedEventInput, type FileSyncDeletedEventInput } from "../../__generated__/graphql.js";
import type { DevArgs } from "../../commands/dev.js";
import type { PullArgs } from "../../commands/pull.js";
import type { PushArgs } from "../../commands/push.js";
import { type EditSubscription } from "../app/edit/edit.js";
import {
  FILE_SYNC_COMPARISON_HASHES_QUERY,
  FILE_SYNC_FILES_QUERY,
  FILE_SYNC_HASHES_QUERY,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../app/edit/operation.js";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { println, sprint, sprintln } from "../output/print.js";
import { filesyncProblemsToProblems, printProblems } from "../output/problems.js";
import { confirm, select } from "../output/prompt.js";
import { noop } from "../util/function.js";
import { Changes, printChanges, type PrintChangesOptions } from "./changes.js";
import { getConflicts, printConflicts, withoutConflictingChanges } from "./conflicts.js";
import { supportsPermissions, swallowEnoent, type Hashes } from "./directory.js";
import { TooManySyncAttemptsError, isFilesVersionMismatchError, swallowFilesVersionMismatch } from "./error.js";
import type { File } from "./file.js";
import { getNecessaryChanges, isEqualHashes, type ChangesWithHash } from "./hashes.js";
import { MergeConflictPreference } from "./strategy.js";
import { type SyncJson, type SyncJsonArgs } from "./sync-json.js";

export type FileSyncArgs = DevArgs | PushArgs | PullArgs;

export type FileSyncHashes = {
  inSync: boolean;
  filesVersionHashes: Hashes;
  localHashes: Hashes;
  localChanges: ChangesWithHash;
  gadgetHashes: Hashes;
  gadgetChanges: ChangesWithHash;
  gadgetFilesVersion: bigint;
};

export class FileSync {
  /**
   * A FIFO async callback queue that ensures we process filesync events
   * in the order we receive them.
   */
  private _syncOperations = new PQueue({ concurrency: 1 });

  constructor(readonly syncJson: SyncJson) {}

  /**
   * Waits for all pending and ongoing filesync operations to complete.
   */
  async idle(): Promise<void> {
    await this._syncOperations.onIdle();
  }

  /**
   * Attempts to send file changes to the Gadget. If a files version
   * mismatch error occurs, this function will merge the changes with
   * Gadget instead.
   *
   * @param ctx - The context to use.
   * @param options - The options to use.
   * @param options.changes - The changes to send.
   * @param options.printLocalChangesOptions - The options to use when printing the local changes.
   * @returns A promise that resolves when the changes have been sent.
   */
  async mergeChangesWithGadget(
    ctx: Context<DevArgs>,
    {
      changes,
      printLocalChangesOptions,
    }: {
      changes: Changes;
      printLocalChangesOptions?: Partial<PrintChangesOptions<false>>;
    },
  ): Promise<void> {
    await this._syncOperations.add(async () => {
      try {
        await this._sendChangesToGadget(ctx, { changes, printLocalChangesOptions });
      } catch (error) {
        swallowFilesVersionMismatch(ctx, error);
        // we either sent the wrong expectedFilesVersion or we received
        // a filesVersion that is greater than the expectedFilesVersion
        // + 1, so we need to stop what we're doing and get in sync
        await this.sync(ctx);
      }
    });
  }

  /**
   * Subscribes to file changes on Gadget and executes the provided
   * callbacks before and after the changes occur.
   *
   * @param ctx - The context to use.
   * @param options - The options to use.
   * @param options.beforeChanges - A callback that is called before the changes occur.
   * @param options.afterChanges - A callback that is called after the changes occur.
   * @param options.onError - A callback that is called if an error occurs.
   * @param options.printGadgetChangesOptions - The options to use when printing the changes from Gadget.
   * @returns A function that unsubscribes from changes on Gadget.
   */
  subscribeToGadgetChanges(
    ctx: Context<DevArgs>,
    {
      beforeChanges = noop,
      afterChanges = noop,
      onError,
      printGadgetChangesOptions,
    }: {
      beforeChanges?: (data: { changed: string[]; deleted: string[] }) => Promisable<void>;
      afterChanges?: (data: { changes: Changes }) => Promisable<void>;
      onError: (error: unknown) => void;
      printGadgetChangesOptions?: Partial<PrintChangesOptions<false>>;
    },
  ): EditSubscription<REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION> {
    return this.syncJson.edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      // the reason this is a function rather than a static value is
      // so that it will be re-evaluated if the connection is lost and
      // then re-established. this ensures that we send our current
      // filesVersion rather than the one that was sent when we first
      // subscribed
      variables: () => ({ localFilesVersion: String(this.syncJson.filesVersion) }),
      onError,
      onData: ({ remoteFileSyncEvents: { changed, deleted, remoteFilesVersion } }) => {
        this._syncOperations
          .add(async () => {
            if (BigInt(remoteFilesVersion) < this.syncJson.filesVersion) {
              ctx.log.warn("skipping received changes because files version is outdated", { filesVersion: remoteFilesVersion });
              return;
            }

            ctx.log.debug("received files", {
              remoteFilesVersion,
              changed: changed.map((change) => change.path),
              deleted: deleted.map((change) => change.path),
            });

            const filterIgnoredFiles = (file: { path: string }): boolean => {
              const ignored = this.syncJson.directory.ignores(file.path);
              if (ignored) {
                ctx.log.warn("skipping received change because file is ignored", { path: file.path });
              }
              return !ignored;
            };

            changed = changed.filter(filterIgnoredFiles);
            deleted = deleted.filter(filterIgnoredFiles);

            if (changed.length === 0 && deleted.length === 0) {
              await this.syncJson.save(remoteFilesVersion);
              return;
            }

            await beforeChanges({
              changed: changed.map((file) => file.path),
              deleted: deleted.map((file) => file.path),
            });

            const changes = await this._writeToLocalFilesystem(ctx, {
              filesVersion: remoteFilesVersion,
              files: changed,
              delete: deleted.map((file) => file.path),
            });

            if (changes.size > 0) {
              const now = dayjs().format("hh:mm:ss A");
              printChanges(ctx, {
                changes,
                tense: "past",
                ensureNewLineAbove: true,
                message: sprint`← Received from ${this.syncJson.app.slug} (${this.syncJson.env.name}) {gray ${now}}`,
                limit: 10,
                ...printGadgetChangesOptions,
              });
            }

            await afterChanges({ changes });
          })
          .catch(onError);
      },
    });
  }

  async hashes(ctx: Context<SyncJsonArgs>): Promise<FileSyncHashes> {
    const [localHashes, { filesVersionHashes, gadgetHashes, gadgetFilesVersion }] = await Promise.all([
      // get the hashes of our local files
      this.syncJson.directory.hashes(),
      // get the hashes of our local filesVersion and the latest filesVersion
      (async () => {
        let gadgetFilesVersion: bigint;
        let gadgetHashes: Hashes;
        let filesVersionHashes: Hashes;

        if (this.syncJson.filesVersion === 0n) {
          // we're either syncing for the first time or we're syncing a
          // non-empty directory without a `.gadget/sync.json` file,
          // regardless just get the hashes of the latest filesVersion
          const { fileSyncHashes } = await this.syncJson.edit.query({ query: FILE_SYNC_HASHES_QUERY });
          gadgetFilesVersion = BigInt(fileSyncHashes.filesVersion);
          gadgetHashes = fileSyncHashes.hashes;
          filesVersionHashes = {};
        } else {
          // this isn't the first time we're syncing, so get the hashes
          // of the files at our local filesVersion and the latest
          // filesVersion
          const { fileSyncComparisonHashes } = await this.syncJson.edit.query({
            query: FILE_SYNC_COMPARISON_HASHES_QUERY,
            variables: { filesVersion: String(this.syncJson.filesVersion) },
          });
          gadgetFilesVersion = BigInt(fileSyncComparisonHashes.latestFilesVersionHashes.filesVersion);
          gadgetHashes = fileSyncComparisonHashes.latestFilesVersionHashes.hashes;
          filesVersionHashes = fileSyncComparisonHashes.filesVersionHashes.hashes;
        }

        return { filesVersionHashes, gadgetHashes, gadgetFilesVersion };
      })(),
    ]);

    const inSync = isEqualHashes(ctx, localHashes, gadgetHashes);

    const localChanges = getNecessaryChanges(ctx, {
      from: filesVersionHashes,
      to: localHashes,
      existing: gadgetHashes,
      ignore: [".gadget/"],
    });

    let gadgetChanges = getNecessaryChanges(ctx, {
      from: filesVersionHashes,
      to: gadgetHashes,
      existing: localHashes,
    });

    if (!inSync && localChanges.size === 0 && gadgetChanges.size === 0) {
      // the local filesystem is missing .gadget/ files
      gadgetChanges = getNecessaryChanges(ctx, { from: localHashes, to: gadgetHashes });
      assert(gadgetChanges.size > 0, "expected gadgetChanges to have changes");
      assert(
        Array.from(gadgetChanges.keys()).every((path) => path.startsWith(".gadget/")),
        "expected all gadgetChanges to be .gadget/ files",
      );
    }

    assert(inSync || localChanges.size > 0 || gadgetChanges.size > 0, "there must be changes if hashes don't match");

    return {
      inSync,
      filesVersionHashes,
      localHashes,
      localChanges,
      gadgetHashes,
      gadgetChanges,
      gadgetFilesVersion,
    };
  }

  /**
   * Ensures the local filesystem is in sync with Gadget's filesystem.
   * - All non-conflicting changes are automatically merged.
   * - Conflicts are resolved by prompting the user to either keep their local changes or keep Gadget's changes.
   * - This function will not return until the filesystem is in sync.
   */
  async sync(ctx: Context<DevArgs>, { hashes, maxAttempts = 10 }: { hashes?: FileSyncHashes; maxAttempts?: number } = {}): Promise<void> {
    let attempt = 0;

    do {
      if (attempt === 0) {
        hashes ??= await this.hashes(ctx);
      } else {
        hashes = await this.hashes(ctx);
      }

      if (hashes.inSync) {
        this._syncOperations.clear();
        ctx.log.info("filesystem in sync");
        await this.syncJson.save(hashes.gadgetFilesVersion);
        return;
      }

      attempt += 1;
      ctx.log.info("merging", { attempt, ...hashes });

      try {
        await this._merge(ctx, hashes);
      } catch (error) {
        swallowFilesVersionMismatch(ctx, error);
        // we either sent the wrong expectedFilesVersion or we received
        // a filesVersion that is greater than the expectedFilesVersion
        // + 1, so try again
      }
    } while (attempt < maxAttempts);

    throw new TooManySyncAttemptsError(maxAttempts);
  }

  /**
   * Pushes any changes made to the local filesystem since the last sync
   * to Gadget.
   *
   * If Gadget has also made changes since the last sync, and --force
   * was not passed, the user will be prompted to discard them.
   */
  async push(
    ctx: Context<PullArgs>,
    {
      hashes,
      force,
      printLocalChangesOptions,
      printGadgetChangesOptions,
    }: {
      hashes?: FileSyncHashes;
      force?: boolean;
      printLocalChangesOptions?: Partial<PrintChangesOptions<false>>;
      printGadgetChangesOptions?: Partial<PrintChangesOptions<false>>;
    } = {},
  ): Promise<void> {
    const { localHashes, gadgetHashes, gadgetChanges, gadgetFilesVersion } = hashes ?? (await this.hashes(ctx));
    const localChanges = getNecessaryChanges(ctx, { from: gadgetHashes, to: localHashes, ignore: [".gadget/"] });
    if (localChanges.size === 0) {
      println({ ensureNewLineAbove: true })("There are no changes to push.");
      return;
    }

    if (
      gadgetChanges.size > 0 &&
      // don't prompt if the only changes are .gadget/ files
      Array.from(gadgetChanges.keys()).some((path) => !path.startsWith(".gadget/")) &&
      !(force ?? ctx.args["--force"])
    ) {
      printChanges(ctx, {
        ensureNewLineAbove: true,
        changes: gadgetChanges,
        tense: "past",
        message: sprint`{bold Your environment's files have changed since you last synced.}`,
        ...printGadgetChangesOptions,
      });

      await confirm(ctx, { message: "Do you want to discard your environment's changes?" });
    }

    await this._sendChangesToGadget(ctx, {
      changes: localChanges,
      expectedFilesVersion: gadgetFilesVersion,
      printLocalChangesOptions: {
        tense: "present",
        ensureNewLineAbove: true,
        message: sprint`Pushed changes {gray ${dayjs().format("hh:mm:ss A")}}`,
        ...printLocalChangesOptions,
      },
    });
  }

  async pull(
    ctx: Context<PullArgs>,
    {
      hashes,
      force,
      printLocalChangesOptions,
      printGadgetChangesOptions,
    }: {
      hashes?: FileSyncHashes;
      force?: boolean;
      printLocalChangesOptions?: Partial<PrintChangesOptions<false>>;
      printGadgetChangesOptions?: Partial<PrintChangesOptions<false>>;
    } = {},
  ): Promise<void> {
    const { localChanges, localHashes, gadgetHashes, gadgetFilesVersion } = hashes ?? (await this.hashes(ctx));
    const gadgetChanges = getNecessaryChanges(ctx, { from: localHashes, to: gadgetHashes });
    if (gadgetChanges.size === 0) {
      println({ ensureNewLineAbove: true })("There are no changes to pull.");
      return;
    }

    if (localChanges.size > 0 && !(force ?? ctx.args["--force"])) {
      printChanges(ctx, {
        ensureNewLineAbove: true,
        changes: localChanges,
        tense: "past",
        message: sprint`{bold Your local files have changed since you last synced.}`,
        ...printLocalChangesOptions,
      });

      await confirm(ctx, { message: "Do you want to discard your local changes?" });
    }

    await this._getChangesFromGadget(ctx, {
      changes: gadgetChanges,
      filesVersion: gadgetFilesVersion,
      printGadgetChangesOptions: {
        tense: "present",
        ensureNewLineAbove: true,
        message: sprint`Pulled changes {gray ${dayjs().format("hh:mm:ss A")}}`,
        ...printGadgetChangesOptions,
      },
    });
  }

  private async _merge(ctx: Context<DevArgs>, { localChanges, gadgetChanges, gadgetFilesVersion }: FileSyncHashes): Promise<void> {
    const conflicts = getConflicts({ localChanges, gadgetChanges });
    if (conflicts.size > 0) {
      ctx.log.debug("conflicts detected", { conflicts });

      let preference = ctx.args["--prefer"];
      if (!preference) {
        printConflicts(ctx, {
          message: sprint`{bold You have conflicting changes with Gadget}`,
          conflicts,
        });

        preference = await select(ctx, {
          message: "How would you like to resolve these conflicts?",
          choices: Object.values(MergeConflictPreference),
        });
      }

      switch (preference) {
        case MergeConflictPreference.CANCEL: {
          process.exit(0);
          break;
        }
        case MergeConflictPreference.LOCAL: {
          gadgetChanges = withoutConflictingChanges({ conflicts, changes: gadgetChanges });
          break;
        }
        case MergeConflictPreference.GADGET: {
          localChanges = withoutConflictingChanges({ conflicts, changes: localChanges });
          break;
        }
      }
    }

    if (gadgetChanges.size > 0) {
      await this._getChangesFromGadget(ctx, { changes: gadgetChanges, filesVersion: gadgetFilesVersion });
    }

    if (localChanges.size > 0) {
      await this._sendChangesToGadget(ctx, { changes: localChanges, expectedFilesVersion: gadgetFilesVersion });
    }
  }

  private async _getChangesFromGadget(
    ctx: Context<SyncJsonArgs>,
    {
      filesVersion,
      changes,
      printGadgetChangesOptions,
    }: {
      filesVersion: bigint;
      changes: Changes | ChangesWithHash;
      printGadgetChangesOptions?: Partial<PrintChangesOptions<false>>;
    },
  ): Promise<void> {
    ctx.log.debug("getting changes from gadget", { filesVersion, changes });
    const created = changes.created();
    const updated = changes.updated();

    let files: File[] = [];
    if (created.length > 0 || updated.length > 0) {
      const { fileSyncFiles } = await this.syncJson.edit.query({
        query: FILE_SYNC_FILES_QUERY,
        variables: {
          paths: [...created, ...updated],
          filesVersion: String(filesVersion),
          encoding: FileSyncEncoding.Base64,
        },
      });

      files = fileSyncFiles.files;
    }

    await this._writeToLocalFilesystem(ctx, {
      filesVersion,
      files,
      delete: changes.deleted(),
    });

    printChanges(ctx, {
      changes,
      tense: "past",
      ensureNewLineAbove: true,
      message: sprint`← Received from ${this.syncJson.app.slug} (${this.syncJson.env.name}) {gray ${dayjs().format("hh:mm:ss A")}}`,
      ...printGadgetChangesOptions,
    });
  }

  private async _sendChangesToGadget(
    ctx: Context<SyncJsonArgs>,
    {
      changes,
      expectedFilesVersion = this.syncJson.filesVersion,
      printLocalChangesOptions,
    }: {
      changes: Changes;
      expectedFilesVersion?: bigint;
      printLocalChangesOptions?: Partial<PrintChangesOptions<false>>;
    },
  ): Promise<void> {
    ctx.log.debug("sending changes to gadget", { expectedFilesVersion, changes });
    const changed: FileSyncChangedEventInput[] = [];
    const deleted: FileSyncDeletedEventInput[] = [];

    await pMap(changes, async ([normalizedPath, change]) => {
      if (change.type === "delete") {
        deleted.push({ path: normalizedPath });
        return;
      }

      const absolutePath = this.syncJson.directory.absolute(normalizedPath);

      let stats;
      try {
        stats = await fs.stat(absolutePath);
      } catch (error) {
        swallowEnoent(error);
        ctx.log.debug("skipping change because file doesn't exist", { path: normalizedPath });
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
      ctx.log.debug("skipping send because there are no changes");
      return;
    }

    const {
      publishFileSyncEvents: { remoteFilesVersion, problems: filesyncProblems },
    } = await this.syncJson.edit.mutate({
      mutation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
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

    printChanges(ctx, {
      changes,
      tense: "past",
      ensureNewLineAbove: true,
      message: sprint`→ Sent to ${this.syncJson.app.slug} (${this.syncJson.env.name}) {gray ${dayjs().format("hh:mm:ss A")}}`,
      ...printLocalChangesOptions,
    });

    if (BigInt(remoteFilesVersion) > expectedFilesVersion + 1n) {
      // we can't save the remoteFilesVersion because we haven't
      // received the intermediate filesVersions yet
      throw new Error("Files version mismatch");
    }

    await this.syncJson.save(remoteFilesVersion);

    if (filesyncProblems.length > 0) {
      let output = sprintln`{red Gadget has detected the following fatal errors with your files:}`;
      output += sprintln("");
      output += printProblems({ toStr: true, problems: filesyncProblemsToProblems(filesyncProblems), showFileTypes: false });
      output += sprintln("");
      output += sprintln`{red Your app will not be operational until all fatal errors are fixed.}`;
      println({ ensureNewLineAbove: true })(output);
    }
  }

  private async _writeToLocalFilesystem(
    ctx: Context<SyncJsonArgs>,
    options: { filesVersion: bigint | string; files: File[]; delete: string[] },
  ): Promise<Changes> {
    const filesVersion = BigInt(options.filesVersion);
    assert(filesVersion >= this.syncJson.filesVersion, "filesVersion must be greater than or equal to current filesVersion");

    ctx.log.debug("writing to local filesystem", {
      filesVersion,
      files: options.files.map((file) => file.path),
      delete: options.delete,
    });

    const created: string[] = [];
    const updated: string[] = [];

    await pMap(options.delete, async (filepath) => {
      const currentPath = this.syncJson.directory.absolute(filepath);
      const backupPath = this.syncJson.directory.absolute(".gadget/backup", this.syncJson.directory.relative(filepath));

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
          // windows tends to run into these issues way more often than
          // mac/linux, so we retry more times
          retries: config.windows ? 4 : 2,
          minTimeout: ms("100ms"),
          onFailedAttempt: (error) => {
            ctx.log.warn("failed to move file to backup", { error, currentPath, backupPath });
          },
        },
      );
    });

    await pMap(options.files, async (file) => {
      const absolutePath = this.syncJson.directory.absolute(file.path);
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

      if (absolutePath === this.syncJson.directory.absolute(".ignore")) {
        await this.syncJson.directory.loadIgnoreFile();
      }
    });

    await this.syncJson.save(String(filesVersion));

    const changes = new Changes([
      ...created.map((path) => [path, { type: "create" }] as const),
      ...updated.map((path) => [path, { type: "update" }] as const),
      ...options.delete.map((path) => [path, { type: "delete" }] as const),
    ]);

    if (changes.has("yarn.lock")) {
      ctx.log.info("running yarn install --check-files");
      await execa("yarn", ["install", "--check-files"], { cwd: this.syncJson.directory.path })
        .then(() => ctx.log.info("yarn install complete"))
        .catch((error: unknown) => ctx.log.error("yarn install failed", { error }));
    }

    return changes;
  }
}
