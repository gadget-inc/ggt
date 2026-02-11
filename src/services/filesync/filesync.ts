import type { Promisable } from "type-fest";

import chalk from "chalk";
import { execa } from "execa";
import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import process from "node:process";
import pMap from "p-map";
import PQueue from "p-queue";
import pluralize from "pluralize";

import type { Command } from "../command/command.js";
import type { Context } from "../command/context.js";
import type { Fields } from "../output/log/field.js";
import type { File } from "./file.js";

import { FileSyncEncoding, type FileSyncChangedEventInput, type FileSyncDeletedEventInput } from "../../__generated__/graphql.js";
import { type EditSubscription } from "../app/edit/edit.js";
import {
  ENVIRONMENT_LOGS_SUBSCRIPTION,
  FILE_SYNC_COMPARISON_HASHES_QUERY,
  FILE_SYNC_FILES_QUERY,
  FILE_SYNC_HASHES_QUERY,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../app/edit/operation.js";
import { confirm } from "../output/confirm.js";
import { Level } from "../output/log/level.js";
import { createEnvironmentStructuredLogger, type LoggingArgsResult } from "../output/log/structured.js";
import { println } from "../output/print.js";
import { filesyncProblemsToProblems, sprintProblems } from "../output/problems.js";
import { EdgeCaseError } from "../output/report.js";
import { select } from "../output/select.js";
import { spin, type spinner } from "../output/spinner.js";
import { sprint, sprintln } from "../output/sprint.js";
import { symbol } from "../output/symbols.js";
import { ts } from "../output/timestamp.js";
import { noop } from "../util/function.js";
import { isENOENTError, isENOTEMPTYError } from "../util/is.js";
import { serializeError } from "../util/object.js";
import { RETRYABLE_NETWORK_ERROR_CODES } from "../util/retry.js";
import { Changes, printChanges, sprintChanges, type PrintChangesOptions } from "./changes.js";
import { getConflicts, printConflicts, withoutConflictingChanges } from "./conflicts.js";
import { supportsPermissions, swallowEnoent, type Hashes } from "./directory.js";
import { isFilesVersionMismatchError, swallowFilesVersionMismatch, TooManyMergeAttemptsError, TooManyPushAttemptsError } from "./error.js";
import { getNecessaryChanges, isEqualHashes, type ChangesWithHash } from "./hashes.js";
import { MergeConflictPreference } from "./strategy.js";
import { type SyncJson } from "./sync-json.js";

/**
 * The maximum attempts to automatically merge local and environment
 * file changes when a FilesVersionMismatchError is encountered before
 * throwing a {@linkcode TooManyMergeAttemptsError}.
 */
export const MAX_MERGE_ATTEMPTS = 10;

/**
 * The maximum attempts to push local changes to the environment when a
 * FilesVersionMismatchError is encountered before throwing a
 * {@linkcode TooManyPushAttemptsError}.
 */
export const MAX_PUSH_ATTEMPTS = 10;

/**
 * The maximum length of file content that can be pushed to Gadget in a
 * single request.
 */
export const MAX_PUSH_CONTENT_LENGTH = 50 * 1024 * 1024; // 50mb

export type FileSyncHashes = {
  /**
   * Whether the local filesystem is in sync with the environment's
   * filesystem.
   */
  inSync: boolean;

  /**
   * Whether the local filesystem and the environment's filesystem have
   * both changed since the last sync.
   */
  bothChanged: boolean;

  /**
   * Whether only .gadget/ files have changed on the environment's
   * filesystem.
   */
  onlyDotGadgetFilesChanged: boolean;

  /**
   * The hashes of the files at the local filesVersion.
   */
  localFilesVersionHashes: Hashes;

  /**
   * The hashes of the files on the local filesystem.
   */
  localHashes: Hashes;

  /**
   * The changes the local filesystem has made since the last sync.
   */
  localChanges: ChangesWithHash;

  /**
   * The changes the local filesystem needs to push to make the
   * environment's filesystem in sync with the local filesystem.
   *
   * NOTE: If the environment's filesystem has changed since the last
   * sync, these changes will undo those changes.
   */
  localChangesToPush: Changes | ChangesWithHash;

  /**
   * The filesVersion of the environment's filesystem.
   */
  environmentFilesVersion: bigint;

  /**
   * The hashes of the files on the environment's filesystem.
   */
  environmentHashes: Hashes;

  /**
   * The changes the environment's filesystem has made since the last
   * sync.
   */
  environmentChanges: ChangesWithHash;

  /**
   * The changes the local filesystem needs to pull from the
   * environment's filesystem to be in sync with the environment's
   * filesystem.
   *
   * NOTE: If the local filesystem has changed since the last sync,
   * these changes will undo those changes.
   */
  environmentChangesToPull: Changes | ChangesWithHash;
};

export class FileSync {
  /**
   * A FIFO async callback queue that ensures we process filesync events
   * in the order we receive them.
   */
  private _syncOperations = new PQueue({ concurrency: 1 });

  constructor(readonly syncJson: SyncJson) {}

  async hashes(ctx: Context, { silent = false }: { silent?: boolean } = {}): Promise<FileSyncHashes> {
    const spinner = !silent ? spin({ ensureEmptyLineAbove: true, content: "Calculating file changes." }) : undefined;

    try {
      const [localHashes, { localFilesVersionHashes, environmentHashes, environmentFilesVersion }] = await Promise.all([
        // get the hashes of our local files
        this.syncJson.directory.hashes(),
        // get the hashes of our local filesVersion and the latest filesVersion
        (async () => {
          let localFilesVersionHashes: Hashes;
          let environmentHashes: Hashes;
          let environmentFilesVersion: bigint;

          if (this.syncJson.filesVersion === 0n) {
            // we're either syncing for the first time or we're syncing a
            // non-empty directory without a `.gadget/sync.json` file,
            // regardless get the hashes of the latest filesVersion
            const { fileSyncHashes } = await this.syncJson.edit.query({ query: FILE_SYNC_HASHES_QUERY });
            environmentFilesVersion = BigInt(fileSyncHashes.filesVersion);
            environmentHashes = fileSyncHashes.hashes;
            localFilesVersionHashes = {}; // represents an empty directory
          } else {
            // this isn't the first time we're syncing, so get the
            // hashes of the files at our local filesVersion and the
            // latest filesVersion
            const { fileSyncComparisonHashes } = await this.syncJson.edit.query({
              query: FILE_SYNC_COMPARISON_HASHES_QUERY,
              variables: { filesVersion: String(this.syncJson.filesVersion) },
            });

            localFilesVersionHashes = fileSyncComparisonHashes.filesVersionHashes.hashes;
            environmentHashes = fileSyncComparisonHashes.latestFilesVersionHashes.hashes;
            environmentFilesVersion = BigInt(fileSyncComparisonHashes.latestFilesVersionHashes.filesVersion);
          }

          return { localFilesVersionHashes, environmentHashes, environmentFilesVersion };
        })(),
      ]);

      const inSync = isEqualHashes(ctx, localHashes, environmentHashes);

      const localChanges = getNecessaryChanges(ctx, {
        from: localFilesVersionHashes,
        to: localHashes,
        existing: environmentHashes,
        ignore: [".gadget/"], // gadget manages these files
      });

      let environmentChanges = getNecessaryChanges(ctx, {
        from: localFilesVersionHashes,
        to: environmentHashes,
        existing: localHashes,
      });

      if (!inSync && localChanges.size === 0 && environmentChanges.size === 0) {
        // we're not in sync, but neither the local filesystem nor the
        // environment's filesystem have any changes; this is only
        // possible if the local filesystem has modified .gadget/ files
        environmentChanges = getNecessaryChanges(ctx, { from: localHashes, to: environmentHashes });
        assert(environmentChanges.size > 0, "expected environmentChanges to have changes");
        assert(
          Array.from(environmentChanges.keys()).every((path) => path.startsWith(".gadget/")),
          "expected all environmentChanges to be .gadget/ files",
        );
      }

      assert(inSync || localChanges.size > 0 || environmentChanges.size > 0, "there must be changes if hashes don't match");

      const localChangesToPush = getNecessaryChanges(ctx, { from: environmentHashes, to: localHashes, ignore: [".gadget/"] });
      const environmentChangesToPull = getNecessaryChanges(ctx, { from: localHashes, to: environmentHashes });

      const onlyDotGadgetFilesChanged =
        environmentChanges.size > 0 && Array.from(environmentChanges.keys()).every((filepath) => filepath.startsWith(".gadget/"));

      const bothChanged = localChanges.size > 0 && environmentChanges.size > 0 && !onlyDotGadgetFilesChanged;

      if (spinner) {
        if (onlyDotGadgetFilesChanged) {
          // only .gadget/ files changed, so pretend like nothing happened
          spinner.clear();
        } else if (inSync) {
          spinner.succeed(`Your files are up to date. ${ts()}`);
        } else {
          spinner.succeed(`Calculated file changes. ${ts()}`);
        }
      }

      return {
        inSync,
        localFilesVersionHashes,
        localHashes,
        localChanges,
        localChangesToPush,
        environmentHashes,
        environmentChanges,
        environmentChangesToPull,
        environmentFilesVersion,
        onlyDotGadgetFilesChanged,
        bothChanged,
      };
    } catch (error) {
      if (spinner) {
        spinner.fail();
      }
      throw error;
    }
  }

  async print(ctx: Context, { hashes }: { hashes?: FileSyncHashes } = {}): Promise<void> {
    const { inSync, localChanges, environmentChanges, onlyDotGadgetFilesChanged, bothChanged } = hashes ?? (await this.hashes(ctx));
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
      println({ ensureEmptyLineAbove: true, content: sprint`Your local files {underline have not} changed.` });
    }

    if (environmentChanges.size > 0 && !onlyDotGadgetFilesChanged) {
      printChanges(ctx, {
        changes: environmentChanges,
        tense: "past",
        title: sprint`Your environment's files {underline have}${bothChanged ? " also" : ""} changed.`,
      });
    } else {
      println({ ensureEmptyLineAbove: true, content: sprint`Your environment's files {underline have not} changed.` });
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
   * @param options.printEnvironmentChangesOptions - The options to use when printing the changes from Gadget.
   * @returns A promise that resolves when the changes have been sent.
   */
  async mergeChangesWithEnvironment(
    ctx: Context,
    {
      changes,
      printLocalChangesOptions,
      printEnvironmentChangesOptions,
    }: {
      changes: Changes;
      printLocalChangesOptions?: Partial<PrintChangesOptions>;
      printEnvironmentChangesOptions?: Partial<PrintChangesOptions>;
    },
  ): Promise<void> {
    await this._syncOperations.add(async () => {
      try {
        await this._sendChangesToEnvironment(ctx, { changes, printLocalChangesOptions });
      } catch (error) {
        swallowFilesVersionMismatch(ctx, error);
        // we either sent the wrong expectedFilesVersion or we received
        // a filesVersion that is greater than the expectedFilesVersion
        // + 1, so we need to stop what we're doing and get in sync
        await this.merge(ctx, { printEnvironmentChangesOptions });
      }
    });
  }

  subscribeToEnvironmentLogs(
    args: LoggingArgsResult,
    {
      onError,
    }: {
      onError: (error: unknown) => void;
    },
  ): EditSubscription<ENVIRONMENT_LOGS_SUBSCRIPTION> {
    const logger = createEnvironmentStructuredLogger(this.syncJson.environment);

    const includedLevels = Object.entries(Level)
      .filter(([_, value]) => {
        return value >= args["--log-level"];
      })
      .map(([key]) => key.toLowerCase())
      .join("|");

    return this.syncJson.edit.subscribe({
      subscription: ENVIRONMENT_LOGS_SUBSCRIPTION,
      variables: () => ({
        query: `{environment_id="${this.syncJson.environment.id}"} | json | level=~"${includedLevels}"${args["--my-logs"] ? ' | source="user"' : ""}`,
        start: new Date(),
      }),
      onError,
      onData: ({ logsSearchV2 }) => {
        for (const log of logsSearchV2.data["messages"] as [string, string][]) {
          const message: unknown = JSON.parse(log[1]);
          const { msg, name, level, ...fields } = message as Record<string, unknown>;

          logger(
            level as string,
            name as string,
            msg as Lowercase<string>,
            {
              ...fields,
            } as Fields,
            new Date(Number(log[0]) / 1_000_000),
          );
        }
      },
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
   * @param options.printEnvironmentChangesOptions - The options to use when printing the changes from Gadget.
   * @returns A function that unsubscribes from changes on Gadget.
   */
  subscribeToEnvironmentChanges(
    ctx: Context,
    {
      beforeChanges = noop,
      printEnvironmentChangesOptions,
      afterChanges = noop,
      onError,
    }: {
      beforeChanges?: (data: { changed: string[]; deleted: string[] }) => Promisable<void>;
      printEnvironmentChangesOptions?: Partial<PrintChangesOptions>;
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
              const ignored = this.syncJson.directory.ignores(file.path, file.path.endsWith("/"));
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

            const changes = await this.writeToLocalFilesystem(ctx, {
              filesVersion: remoteFilesVersion,
              files: changed,
              delete: deleted.map((file) => file.path),
              printEnvironmentChangesOptions: {
                tense: "past",
                ensureEmptyLineAbove: true,
                title: sprintln`{greenBright ${symbol.tick}} Pulled ${pluralize("file", changed.length + deleted.length)}. ${ts()}`,
                limit: 5,
                ...printEnvironmentChangesOptions,
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
  async merge(
    ctx: Context,
    {
      hashes,
      prefer,
      maxAttempts = MAX_MERGE_ATTEMPTS,
      printLocalChangesOptions,
      printEnvironmentChangesOptions,
      silent,
    }: {
      hashes?: FileSyncHashes;
      prefer?: MergeConflictPreference;
      maxAttempts?: number;
      printLocalChangesOptions?: Partial<PrintChangesOptions>;
      printEnvironmentChangesOptions?: Partial<PrintChangesOptions>;
      silent?: boolean;
    } = {},
  ): Promise<void> {
    let attempt = 0;

    do {
      if (attempt === 0) {
        hashes ??= await this.hashes(ctx, { silent });
      } else {
        hashes = await this.hashes(ctx, { silent });
      }

      if (hashes.inSync) {
        this._syncOperations.clear();
        ctx.log.info("filesystem in sync");
        await this.syncJson.save(hashes.environmentFilesVersion);
        return;
      }

      attempt += 1;
      ctx.log.info("merging", { attempt, ...hashes });

      try {
        await this._merge(ctx, { hashes, prefer, printLocalChangesOptions, printEnvironmentChangesOptions });
      } catch (error) {
        swallowFilesVersionMismatch(ctx, error);
        // we either sent the wrong expectedFilesVersion or we received
        // a filesVersion that is greater than the expectedFilesVersion
        // + 1, so try again
      }
    } while (attempt < maxAttempts);

    throw new TooManyMergeAttemptsError(maxAttempts);
  }

  /**
   * Pushes any changes made to the local filesystem since the last sync
   * to Gadget.
   */
  async push(
    ctx: Context,
    {
      command,
      hashes,
      maxAttempts = MAX_PUSH_ATTEMPTS,
      printLocalChangesOptions,
    }: {
      command: Command;
      hashes?: FileSyncHashes;
      maxAttempts?: number;
      printLocalChangesOptions?: PrintChangesOptions;
    },
  ): Promise<void> {
    let attempt = 0;

    do {
      const { localChangesToPush, environmentFilesVersion } = hashes ?? (await this.hashes(ctx));
      if (localChangesToPush.size === 0) {
        return;
      }

      attempt += 1;

      try {
        await this._sendChangesToEnvironment(ctx, {
          changes: localChangesToPush,
          expectedFilesVersion: environmentFilesVersion,
          printLocalChangesOptions,
        });
        return;
      } catch (error) {
        swallowFilesVersionMismatch(ctx, error);
        // we either sent the wrong expectedFilesVersion or received a
        // filesVersion that is greater than expectedFilesVersion + 1
        hashes = await this.hashes(ctx, { silent: true });
        if (hashes.environmentFilesVersion > environmentFilesVersion + 1n) {
          // the returned filesVersion is greater than the
          // expectedFilesVersion + 1, so the files were pushed
          // successfully.
          return;
        }

        // we sent the wrong expectedFilesVersion and files have changed
        // on the environment's filesystem since we last checked
        if (hashes.onlyDotGadgetFilesChanged) {
          // only .gadget/ files changed, so we can try again
          continue;
        }

        // non-.gadget/ files changed, so we can't try again
        throw new EdgeCaseError(sprint`
          Your environment's files have changed since we last checked.

          Please re-run "ggt ${command}" to see the changes and try again.
        `);
      }
    } while (attempt < maxAttempts);

    throw new TooManyPushAttemptsError(maxAttempts, command);
  }

  async pull(
    ctx: Context,
    {
      hashes,
      force,
      printEnvironmentChangesOptions,
    }: {
      hashes?: FileSyncHashes;
      force?: boolean;
      printEnvironmentChangesOptions?: Partial<PrintChangesOptions>;
    } = {},
  ): Promise<void> {
    const { localChanges, environmentChangesToPull, environmentFilesVersion } = hashes ?? (await this.hashes(ctx));
    assert(environmentChangesToPull.size > 0, "cannot pull if there are no changes");

    // TODO: lift this check up to the pull command
    if (localChanges.size > 0 && !force) {
      await confirm(sprint`
        Are you sure you want to {underline discard} your local changes?
      `);
    }

    await this._getChangesFromEnvironment(ctx, {
      changes: environmentChangesToPull,
      filesVersion: environmentFilesVersion,
      printEnvironmentChangesOptions,
    });
  }

  async writeToLocalFilesystem(
    ctx: Context,
    options: {
      filesVersion: bigint | string;
      files: File[];
      delete: string[];
      printEnvironmentChangesOptions?: Partial<PrintChangesOptions>;
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

    const changes = new Changes();
    const directoriesWithDeletedFiles = new Set<string>();

    for (const pathToDelete of options.delete.sort().reverse()) {
      // add all the directories that contain this file to
      // directoriesWithDeletedFiles so we can clean them up later
      let dir = path.dirname(pathToDelete);
      while (dir !== ".") {
        directoriesWithDeletedFiles.add(this.syncJson.directory.normalize(dir, true));
        dir = path.dirname(dir);
      }

      await fs.remove(this.syncJson.directory.absolute(pathToDelete));
      changes.set(pathToDelete, { type: "delete" });
    }

    if (options.delete.includes(".ignore")) {
      await this.syncJson.directory.loadIgnoreFile();
    }

    for (const directoryWithDeletedFile of Array.from(directoriesWithDeletedFiles.values()).sort().reverse()) {
      if (options.files.some((file) => file.path === directoryWithDeletedFile)) {
        // we're about to create this directory, so we don't need to
        // clean it up
        continue;
      }

      try {
        // delete any empty directories that contained a deleted file.
        // if the empty directory should continue to exist, we would
        // have received an event to create it above
        await fs.rmdir(this.syncJson.directory.absolute(directoryWithDeletedFile));
        changes.set(directoryWithDeletedFile, { type: "delete" });
      } catch (error) {
        if (isENOENTError(error) || isENOTEMPTYError(error)) {
          // noop if the directory doesn't exist or isn't empty
          continue;
        }
        throw error;
      }
    }

    await pMap(options.files, async (file) => {
      const absolutePath = this.syncJson.directory.absolute(file.path);
      if (await fs.pathExists(absolutePath)) {
        if (!file.path.endsWith("/")) {
          // only track file updates, not directory updates
          changes.set(file.path, { type: "update" });
        }
      } else {
        changes.set(file.path, { type: "create" });
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

    options.spinner?.clear();

    printChanges(ctx, {
      changes,
      tense: "past",
      title: sprint`{greenBright ${symbol.arrowDown}} Pulled ${pluralize("file", changes.size)}. ${ts()}`,
      ...options.printEnvironmentChangesOptions,
    });

    if (changes.has("yarn.lock")) {
      const spinner = spin({ ensureEmptyLineAbove: true, content: 'Running "yarn install --check-files"' });

      try {
        await execa("yarn", ["install", "--check-files"], { cwd: this.syncJson.directory.path });
        spinner.succeed(`Ran "yarn install --check-files" ${ts()}`);
      } catch (error) {
        spinner.fail();
        ctx.log.error("yarn install failed", { error });

        const content = serializeError(error).message;
        if (content) {
          println({ ensureEmptyLineAbove: true, indent: 2, content });
        }
      }
    }

    return changes;
  }

  private async _merge(
    ctx: Context,
    {
      hashes: { localChanges, environmentChanges, environmentFilesVersion },
      prefer: preference,
      printLocalChangesOptions,
      printEnvironmentChangesOptions,
    }: {
      hashes: FileSyncHashes;
      prefer?: MergeConflictPreference;
      printLocalChangesOptions?: Partial<PrintChangesOptions>;
      printEnvironmentChangesOptions?: Partial<PrintChangesOptions>;
    },
  ): Promise<void> {
    const conflicts = getConflicts({ localChanges, environmentChanges });
    if (conflicts.size > 0) {
      ctx.log.debug("conflicts detected", { conflicts });

      if (!preference) {
        printConflicts({ conflicts });
        preference = await select({
          choices: Object.values(MergeConflictPreference),
          content: chalk.bold("How should we resolve these conflicts?"),
        });
      }

      switch (preference) {
        case MergeConflictPreference.CANCEL: {
          process.exit(0);
          break;
        }
        case MergeConflictPreference.LOCAL: {
          environmentChanges = withoutConflictingChanges({ conflicts, changes: environmentChanges });
          break;
        }
        case MergeConflictPreference.ENVIRONMENT: {
          localChanges = withoutConflictingChanges({ conflicts, changes: localChanges });
          break;
        }
      }
    }

    if (environmentChanges.size > 0) {
      await this._getChangesFromEnvironment(ctx, {
        changes: environmentChanges,
        filesVersion: environmentFilesVersion,
        printEnvironmentChangesOptions,
      });
    }

    if (localChanges.size > 0) {
      await this._sendChangesToEnvironment(ctx, {
        changes: localChanges,
        expectedFilesVersion: environmentFilesVersion,
        printLocalChangesOptions,
      });
    }
  }

  private async _getChangesFromEnvironment(
    ctx: Context,
    {
      filesVersion,
      changes,
      printEnvironmentChangesOptions,
    }: {
      filesVersion: bigint;
      changes: Changes | ChangesWithHash;
      printEnvironmentChangesOptions?: Partial<PrintChangesOptions>;
    },
  ): Promise<void> {
    ctx.log.debug("getting changes from gadget", { filesVersion, changes });
    const created = changes.created();
    const updated = changes.updated();

    const spinner = spin({
      ensureEmptyLineAbove: true,
      content: sprintChanges(ctx, {
        changes,
        tense: "present",
        title: sprint`Pulling ${pluralize("file", changes.size)}.`,
        ...printEnvironmentChangesOptions,
      }),
    });

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

      await this.writeToLocalFilesystem(ctx, {
        filesVersion,
        files,
        delete: changes.deleted(),
        spinner,
        printEnvironmentChangesOptions,
      });
    } catch (error) {
      spinner.fail();
      throw error;
    }
  }

  private async _sendChangesToEnvironment(
    ctx: Context,
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

    const contentLength = changed.map((change) => change.content.length).reduce((a, b) => a + b, 0);
    if (contentLength > MAX_PUSH_CONTENT_LENGTH) {
      throw new EdgeCaseError(sprint`
        {underline Your file changes are too large to push.}

        Run "ggt status" to see your changes and consider
        ignoring some files or pushing in smaller batches.
      `);
    }

    const spinner = spin({
      ensureEmptyLineAbove: true,
      content: sprintChanges(ctx, {
        changes,
        tense: "present",
        title: sprintln`Pushing ${pluralize("file", changed.length + deleted.length)}. ${symbol.arrowRight}`,
        ...printLocalChangesOptions,
      }),
    });

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
            errorCodes: [...RETRYABLE_NETWORK_ERROR_CODES],
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
          title: sprintln`Pushed ${pluralize("file", changed.length + deleted.length)}. ${symbol.arrowRight} ${ts()}`,
          ...printLocalChangesOptions,
        }),
      );

      if (filesyncProblems.length > 0) {
        println({
          ensureEmptyLineAbove: true,
          content: sprint`
            {red Gadget has detected the following fatal errors with your files:}

            ${sprintProblems({
              problems: filesyncProblemsToProblems(filesyncProblems),
              showFileTypes: false,
              indent: 12,
            })}

            {red Your app will not be operational until all fatal errors are fixed.}
          `,
        });
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
}
