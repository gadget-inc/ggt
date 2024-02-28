import dayjs from "dayjs";
import { execa } from "execa";
import fs from "fs-extra";
import ms from "ms";
import assert from "node:assert";
import process from "node:process";
import pMap from "p-map";
import PQueue from "p-queue";
import pRetry from "p-retry";
import pluralize from "pluralize";
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
import { confirm } from "../output/confirm.js";
import { println, sprint, sprintln } from "../output/print.js";
import { filesyncProblemsToProblems, sprintProblems } from "../output/problems.js";
import { select } from "../output/select.js";
import { spin, type spinner } from "../output/spinner.js";
import { noop } from "../util/function.js";
import { serializeError } from "../util/object.js";
import { Changes, printChanges, sprintChanges, type PrintChangesOptions } from "./changes.js";
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
  localChangesToPush: Changes | ChangesWithHash;
  // TODO: rename to environmentHashes
  gadgetHashes: Hashes;
  gadgetChanges: ChangesWithHash;
  gadgetChangesToPull: Changes | ChangesWithHash;
  gadgetFilesVersion: bigint;
};

export class FileSync {
  /**
   * A FIFO async callback queue that ensures we process filesync events
   * in the order we receive them.
   */
  private _syncOperations = new PQueue({ concurrency: 1 });

  constructor(readonly syncJson: SyncJson) {}

  async hashes(ctx: Context<SyncJsonArgs>): Promise<FileSyncHashes> {
    const spinner = spin({ ensureEmptyLineAbove: true })`
      Calculating file changes.
    `;

    // TODO: remove me
    // await delay("5s");

    try {
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

      const localChangesToPush = getNecessaryChanges(ctx, { from: gadgetHashes, to: localHashes, ignore: [".gadget/"] });
      const gadgetChangesToPull = getNecessaryChanges(ctx, { from: localHashes, to: gadgetHashes });

      if (inSync) {
        spinner.succeed`Your files are up to date. {gray ${dayjs().format("hh:mm:ss A")}}`;
      } else {
        spinner.succeed`Calculated file changes. {gray ${dayjs().format("hh:mm:ss A")}}`;
      }

      return {
        inSync,
        filesVersionHashes,
        localHashes,
        localChanges,
        localChangesToPush,
        gadgetHashes,
        gadgetChanges,
        gadgetChangesToPull,
        gadgetFilesVersion,
      };
    } catch (error) {
      spinner.fail();
      throw error;
    }
  }

  async printStatus(ctx: Context<SyncJsonArgs>, { hashes }: { hashes?: FileSyncHashes } = {}): Promise<void> {
    const { inSync, localChanges, gadgetChanges } = hashes ?? (await this.hashes(ctx));
    if (inSync) {
      // the spinner in hashes will have already printed that we're in sync
      return;
    }

    if (localChanges.size > 0) {
      printChanges(ctx, {
        changes: localChanges,
        tense: "past",
        title: sprint`Your local files {underline have} changed.`,
      });
    } else {
      println({ ensureEmptyLineAbove: true })`
        Your local files {underline have not} changed.
      `;
    }

    if (gadgetChanges.size > 0) {
      printChanges(ctx, {
        changes: gadgetChanges,
        tense: "past",
        title: sprint`Your environment's files {underline have} changed.`,
      });
    } else {
      println({ ensureEmptyLineAbove: true })`
        Your environment's files {underline have not} changed.
      `;
    }
  }

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
   * @param options.printGadgetChangesOptions - The options to use when printing the changes from Gadget.
   * @returns A promise that resolves when the changes have been sent.
   */
  async mergeChangesWithGadget(
    ctx: Context<DevArgs>,
    {
      changes,
      printLocalChangesOptions,
      printGadgetChangesOptions,
    }: {
      changes: Changes;
      printLocalChangesOptions?: Partial<PrintChangesOptions>;
      printGadgetChangesOptions?: Partial<PrintChangesOptions>;
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
        await this.sync(ctx, { printGadgetChangesOptions });
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
      printGadgetChangesOptions,
      afterChanges = noop,
      onError,
    }: {
      beforeChanges?: (data: { changed: string[]; deleted: string[] }) => Promisable<void>;
      printGadgetChangesOptions?: Partial<PrintChangesOptions>;
      afterChanges?: (data: { changes: Changes }) => Promisable<void>;
      onError: (error: unknown) => void;
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
              printGadgetChangesOptions: {
                tense: "past",
                ensureEmptyLineAbove: true,
                title: sprintln`{green ✔}  Pulled ${pluralize("file", changed.length + deleted.length)}. ← {gray ${dayjs().format("hh:mm:ss A")}}`,
                limit: 5,
                ...printGadgetChangesOptions,
              },
            });

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
  // TODO: rename to merge
  async sync(
    ctx: Context<DevArgs>,
    {
      hashes,
      maxAttempts = 10,
      printLocalChangesOptions,
      printGadgetChangesOptions,
    }: {
      hashes?: FileSyncHashes;
      maxAttempts?: number;
      printLocalChangesOptions?: Partial<PrintChangesOptions>;
      printGadgetChangesOptions?: Partial<PrintChangesOptions>;
    } = {},
  ): Promise<void> {
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
        await this._merge(ctx, { hashes, printLocalChangesOptions, printGadgetChangesOptions });
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
      printLocalChangesOptions?: PrintChangesOptions;
      printGadgetChangesOptions?: PrintChangesOptions;
    } = {},
  ): Promise<void> {
    const { localChangesToPush, gadgetChanges, gadgetFilesVersion } = hashes ?? (await this.hashes(ctx));
    assert(localChangesToPush.size > 0, "cannot push if there are no changes");

    if (
      // they didn't pass --force
      !(force ?? ctx.args["--force"]) &&
      // their environment's files have changed
      gadgetChanges.size > 0 &&
      // some of the changes aren't .gadget/ files
      Array.from(gadgetChanges.keys()).some((path) => !path.startsWith(".gadget/"))
    ) {
      printChanges(ctx, {
        changes: gadgetChanges,
        tense: "past",
        ensureEmptyLineAbove: true,
        title: sprint`Your environment's files have changed.`,
        ...printGadgetChangesOptions,
      });

      await confirm({ ensureEmptyLineAbove: true })`
        Are you sure you want to {underline discard} these changes?
      `;
    }

    await this._sendChangesToGadget(ctx, {
      // what changes need to be made to your local files to make
      // them match the environment's files
      changes: localChangesToPush,
      expectedFilesVersion: gadgetFilesVersion,
      printLocalChangesOptions,
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
      printLocalChangesOptions?: Partial<PrintChangesOptions>;
      printGadgetChangesOptions?: Partial<PrintChangesOptions>;
    } = {},
  ): Promise<void> {
    const { localChanges, gadgetChangesToPull, gadgetFilesVersion } = hashes ?? (await this.hashes(ctx));
    assert(gadgetChangesToPull.size > 0, "cannot push if there are no changes");

    if (localChanges.size > 0 && !(force ?? ctx.args["--force"])) {
      printChanges(ctx, {
        changes: localChanges,
        tense: "past",
        ensureEmptyLineAbove: true,
        title: sprint`{bold Your local files have changed since you last synced.}`,
        ...printLocalChangesOptions,
      });

      await confirm`
        Are you sure you want to {bold discard} your local changes?
      `;
    }

    await this._getChangesFromGadget(ctx, {
      changes: gadgetChangesToPull,
      filesVersion: gadgetFilesVersion,
      printGadgetChangesOptions,
    });
  }

  private async _merge(
    ctx: Context<DevArgs>,
    {
      hashes: { localChanges, gadgetChanges, gadgetFilesVersion },
      printLocalChangesOptions,
      printGadgetChangesOptions,
    }: {
      hashes: FileSyncHashes;
      printLocalChangesOptions?: Partial<PrintChangesOptions>;
      printGadgetChangesOptions?: Partial<PrintChangesOptions>;
    },
  ): Promise<void> {
    const conflicts = getConflicts({ localChanges, gadgetChanges });
    if (conflicts.size > 0) {
      ctx.log.debug("conflicts detected", { conflicts });

      let preference = ctx.args["--prefer"];
      if (!preference) {
        printConflicts({ conflicts });
        preference = await select({ choices: Object.values(MergeConflictPreference) })`
          {bold How should we resolve these conflicts?}
        `;
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
      await this._getChangesFromGadget(ctx, {
        changes: gadgetChanges,
        filesVersion: gadgetFilesVersion,
        printGadgetChangesOptions,
      });
    }

    if (localChanges.size > 0) {
      await this._sendChangesToGadget(ctx, {
        changes: localChanges,
        expectedFilesVersion: gadgetFilesVersion,
        printLocalChangesOptions,
      });
    }
  }

  // TODO: rename to _getChangesFromEnvironment
  private async _getChangesFromGadget(
    ctx: Context<SyncJsonArgs>,
    {
      filesVersion,
      changes,
      printGadgetChangesOptions,
    }: {
      filesVersion: bigint;
      changes: Changes | ChangesWithHash;
      printGadgetChangesOptions?: Partial<PrintChangesOptions>;
    },
  ): Promise<void> {
    ctx.log.debug("getting changes from gadget", { filesVersion, changes });
    const created = changes.created();
    const updated = changes.updated();

    const spinner = spin(
      sprintChanges(ctx, {
        changes,
        tense: "present",
        title: sprint`Pulling ${pluralize("file", changes.size)}. ←`,
        ensureNewLine: true,
        ensureEmptyLineAbove: true,
        ensureEmptyLineAboveBody: false,
        ...printGadgetChangesOptions,
      }),
    );

    // TODO: remove me
    // await delay("5s");

    try {
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
        spinner,
        printGadgetChangesOptions,
      });
    } catch (error) {
      spinner.fail();
      throw error;
    }
  }

  private async _sendChangesToGadget(
    ctx: Context<SyncJsonArgs>,
    {
      changes,
      expectedFilesVersion = this.syncJson.filesVersion,
      printLocalChangesOptions,
    }: {
      changes: Changes | ChangesWithHash;
      expectedFilesVersion?: bigint;
      printLocalChangesOptions?: Partial<PrintChangesOptions>;
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

    const spinner = spin({ ensureEmptyLineAbove: true })(
      sprintChanges(ctx, {
        changes,
        tense: "present",
        title: sprintln` Pushing ${pluralize("file", changed.length + deleted.length)}. →`,
        ensureEmptyLineAbove: false,
        ensureEmptyLineAboveBody: false,
        ...printLocalChangesOptions,
      }),
    );

    // TODO: remove me
    // await delay("5s");

    try {
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

      if (BigInt(remoteFilesVersion) > expectedFilesVersion + 1n) {
        // we can't save the remoteFilesVersion because we haven't
        // received the intermediate filesVersions yet
        throw new Error("Files version mismatch");
      }

      await this.syncJson.save(remoteFilesVersion);

      spinner.succeed(
        sprintChanges(ctx, {
          changes,
          tense: "past",
          title: " " + sprintln`Pushed ${pluralize("file", changed.length + deleted.length)}. → {gray ${dayjs().format("hh:mm:ss A")}}`,
          ...printLocalChangesOptions,
        }),
      );

      if (filesyncProblems.length > 0) {
        println({ ensureEmptyLineAbove: true })`
          {red Gadget has detected the following fatal errors with your files:}

          ${sprintProblems({
            problems: filesyncProblemsToProblems(filesyncProblems),
            showFileTypes: false,
            indent: 10,
          })}

          {red Your app will not be operational until all fatal errors are fixed.}
        `;
      }
    } catch (error) {
      if (isFilesVersionMismatchError(error)) {
        spinner.clear();
      } else {
        spinner.fail();
      }

      throw error;
    }
  }

  private async _writeToLocalFilesystem(
    ctx: Context<SyncJsonArgs>,
    options: {
      filesVersion: bigint | string;
      files: File[];
      delete: string[];
      printGadgetChangesOptions?: Partial<PrintChangesOptions>;
      spinner?: spinner;
    },
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

    options.spinner?.clear();

    printChanges(ctx, {
      changes,
      tense: "past",
      title: sprint`{green ✔}  Pulled ${pluralize("file", changes.size)}. ← {gray ${dayjs().format("hh:mm:ss A")}}`,
      ensureNewLine: true,
      ensureEmptyLineAbove: true,
      ensureEmptyLineAboveBody: false,
      ...options.printGadgetChangesOptions,
    });

    if (changes.has("yarn.lock")) {
      const spinner = spin({ ensureEmptyLineAbove: true })('Running "yarn install --check-files"');

      try {
        await execa("yarn", ["install", "--check-files"], { cwd: this.syncJson.directory.path });
        spinner.succeed`Ran "yarn install --check-files" {gray ${dayjs().format("hh:mm:ss A")}}`;
      } catch (error) {
        spinner.fail();
        ctx.log.error("yarn install failed", { error });

        const message = serializeError(error).message;
        if (message) {
          println({ ensureEmptyLineAbove: true, indent: 2 })(message);
        }
      }
    }

    return changes;
  }
}
