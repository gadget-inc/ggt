import { Flags } from "@oclif/core";
import type { OptionFlag } from "@oclif/core/lib/interfaces";
import { CLIError } from "@oclif/errors";
import assert from "assert";
import { FSWatcher } from "chokidar";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import { prompt } from "inquirer";
import type { DebouncedFunc } from "lodash";
import { debounce } from "lodash";
import normalizePath from "normalize-path";
import pMap from "p-map";
import PQueue from "p-queue";
import path from "path";
import { BaseCommand } from "../lib/base-command";
import type { Query } from "../lib/client";
import { ignoreEnoent, Ignorer, walkDir, WalkedTooManyFilesError } from "../lib/fs-utils";
import { logger } from "../lib/logger";
import { sleepUntil } from "../lib/sleep";
import type {
  FileSyncChangedEventInput,
  FileSyncDeletedEventInput,
  PublishFileSyncEventsMutation,
  PublishFileSyncEventsMutationVariables,
  RemoteFilesVersionQuery,
  RemoteFilesVersionQueryVariables,
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables,
} from "../__generated__/graphql";

export default class Sync extends BaseCommand {
  static override summary = "Sync your Gadget app's source files to your local file system.";

  static override usage = "sync --app <name> [DIRECTORY]";

  static override args = [
    {
      name: "directory",
      description: "The directory to sync files to. If the directory doesn't exist, it will be created.",
      default: ".",
    },
  ];

  static override flags = {
    "file-push-delay": Flags.integer({
      summary: "Delay in milliseconds before pushing files to your app.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
    }) as OptionFlag<number>,
    "file-stability-threshold": Flags.integer({
      name: "file-stability-threshold",
      summary: "Time in milliseconds a file's size must remain the same.",
      helpGroup: "file",
      helpValue: "ms",
      default: 500,
    }) as OptionFlag<number>,
    "file-poll-interval": Flags.integer({
      name: "file-poll-interval",
      description: "Interval in milliseconds between polling a file's size.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
    }) as OptionFlag<number>,
  };

  static override examples = [
    `$ ggt sync --app my-app ~/gadget/my-app
👀 set up local file watcher
📡 set up remote file subscription
✍️  wrote remote file changes
    total: 1
    files:
      - routes/GET.js
🚀 sent local file changes
    total: 1
    files:
      - routes/GET-ping.ts
  `,

    `# These are equivalent
$ ggt sync --app my-app
$ ggt sync --app my-app.gadget.app
$ ggt sync --app https://my-app.gadget.app `,
  ];

  override readonly requireApp = true;

  dir!: string;

  recentWrites = new Set();

  filePushDelay!: number;

  queue = new PQueue({ concurrency: 1 });

  ignorer!: Ignorer;

  watcher!: FSWatcher;

  metadata = {
    lastWritten: {
      filesVersion: "0",
      mtime: 0,
    },
  };

  publish!: DebouncedFunc<() => void>;

  stop!: (error?: Error) => Promise<void>;

  stopping = false;

  relative(to: string): string {
    return path.relative(this.dir, to);
  }

  absolute(...pathSegments: string[]): string {
    return path.resolve(this.dir, ...pathSegments);
  }

  override async init(): Promise<void> {
    await super.init();
    const { args, flags } = await this.parse(Sync);

    this.dir = path.resolve(args["directory"] as string);

    this.filePushDelay = flags["file-push-delay"];

    // local files that should never be published
    const ignored = ["node_modules/", ".gadget/", ".ggt/", ".git/"];

    this.ignorer = new Ignorer(this.dir, ignored);

    this.watcher = new FSWatcher({
      ignored,
      // don't emit an event for every watched file on boot
      ignoreInitial: true,
      // make sure stats are always present on add/change events
      alwaysStat: true,
      // wait for the entire file to be written before emitting add/change events
      awaitWriteFinish: { pollInterval: flags["file-poll-interval"], stabilityThreshold: flags["file-stability-threshold"] },
    });

    logger.debug("⚙️  starting");
    await fs.ensureDir(this.dir);

    try {
      this.metadata = await fs.readJson(this.absolute(".ggt", "sync.json"));
    } catch (error) {
      // use defaults if the metadata file doesn't exist
      ignoreEnoent(error);

      const d = await fs.opendir(this.dir);
      if ((await d.read()) != null) {
        logger.warn("⚠️ Could not find .ggt/sync.json in a non empty directory");
      }
      await d.close();
    }

    const { remoteFilesVersion } = await this.client.unwrapQuery({ query: REMOTE_FILES_VERSION_QUERY });
    const hasRemoteChanges = BigInt(remoteFilesVersion) > BigInt(this.metadata.lastWritten.filesVersion);

    const getChangedFiles = async (): Promise<Map<string, Stats>> => {
      const files = new Map();
      for await (const filepath of walkDir(this.dir, { ignorer: this.ignorer, maxFiles: 100 })) {
        const stats = await fs.stat(filepath);
        if (stats.mtime.getTime() > this.metadata.lastWritten.mtime) {
          files.set(this.absolute(filepath), stats);
        }
      }
      return files;
    };

    const changedFiles = await getChangedFiles();
    const hasLocalChanges = changedFiles.size > 0;
    if (hasLocalChanges) {
      logger.info(
        { total: changedFiles.size, files: Array.from(changedFiles.keys()).map(this.relative.bind(this)) },
        `ℹ️️  The following local files have changed since the last sync:`
      );
    }

    logger.debug({ metadata: this.metadata, remoteFilesVersion, hasRemoteChanges, hasLocalChanges }, "⚙️  metadata");

    let action: Action | undefined;
    if (hasLocalChanges) {
      ({ action } = await prompt({
        type: "list",
        name: "action",
        choices: [Action.CANCEL, Action.MERGE, Action.RESET],
        message: hasRemoteChanges
          ? "Both local and remote files have changed since the last sync. How would you like to proceed?"
          : "Local files have changed since the last sync. How would you like to proceed?",
      }));
    }

    switch (action) {
      case Action.MERGE: {
        // get all the changed files again in case more changed
        const files = await getChangedFiles();

        // we purposefully don't set the returned remoteFilesVersion here because we haven't processed the in-between versions yet
        await this.client.unwrapQuery({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: {
            input: {
              expectedRemoteFilesVersion: remoteFilesVersion,
              changed: await pMap(files, async ([filepath, stats]) => {
                if (stats.mtime.getTime() > this.metadata.lastWritten.mtime) {
                  this.metadata.lastWritten.mtime = stats.mtime.getTime();
                }

                return {
                  path: normalizePath(this.relative(filepath)),
                  mode: stats.mode,
                  content: await fs.readFile(filepath, "utf-8"),
                };
              }),
              deleted: [],
            },
          },
        });
        break;
      }
      case Action.RESET: {
        await pMap(changedFiles, ([filepath]) => fs.remove(filepath));
        this.metadata.lastWritten.filesVersion = "0";
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }

    logger.debug("⚙️  started");
  }

  async run(): Promise<void> {
    this.stop = async (error?: Error) => {
      if (this.stopping) return;
      this.stopping = true;

      try {
        logger.debug("⚙️  stopping");
        unsubscribe();
        this.watcher.removeAllListeners();
        this.publish.flush();
        await this.queue.onIdle();

        if (!error) {
          logger.info("👋 Goodbye");
          return;
        }

        process.exitCode = 1;

        switch (true) {
          case error.message == "Unexpected server response: 401":
            this.logout();
            logger.warn("⚠️ Session expired");
            logger.info("ℹ️ Run `ggt auth login` to login again");
            break;
          case error instanceof WalkedTooManyFilesError:
            logger.warn("⚠️ Too many files found while starting");
            logger.info("ℹ️ Consider adding more files to your .ignore file");
            break;
          default:
            logger.error({ error }, "🚨 Unexpected error");
        }
      } finally {
        await fs.outputJSON(this.absolute(".ggt", "sync.json"), this.metadata, { spaces: 2 });
        await Promise.allSettled([this.watcher.close(), this.client.dispose()]);
        logger.debug("⚙️  stopped");
      }
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        if (this.stopping) return;
        logger.info(" Stopping sync (press Ctrl+C again to force)");
        void this.stop();
      });
    }

    logger.debug("📡 setting up remote file subscription...");

    const unsubscribe = this.client.subscribe(
      {
        query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
        variables: () => ({ localFilesVersion: this.metadata.lastWritten.filesVersion }),
      },
      {
        complete: () => void this.stop(new CLIError("Unexpected disconnect")),
        error: (error) => void this.stop(error as Error),
        next: (response) => {
          if (!response.data?.remoteFileSyncEvents.changed.length && !response.data?.remoteFileSyncEvents.deleted.length) {
            if (response.errors) void this.stop(new AggregateError(response.errors));
            return;
          }

          const { remoteFilesVersion, changed, deleted } = response.data.remoteFileSyncEvents;
          const remoteFiles = new Map([...deleted, ...changed].map((e) => [e.path, e]));
          logger.debug({ remoteFilesVersion, total: remoteFiles.size, files: remoteFiles.keys() }, "📡 received remote file changes");

          void this.queue
            .add(async () => {
              logger.debug(
                { remoteFilesVersion, total: remoteFiles.size, files: remoteFiles.keys() },
                "✍️  writing remote file changes..."
              );

              await pMap(
                remoteFiles,
                async ([relativePath, file]) => {
                  const filepath = this.absolute(relativePath);
                  this.recentWrites.add(filepath);

                  if ("content" in file) {
                    await fs.ensureDir(path.dirname(filepath), { mode: 0o755 });
                    if (!file.path.endsWith("/")) await fs.writeFile(filepath, file.content, { mode: file.mode });
                  } else {
                    await fs.remove(filepath);
                  }

                  if (filepath == this.ignorer.filepath) {
                    this.ignorer.reload();
                  }
                },
                { stopOnError: false }
              );

              this.metadata.lastWritten.filesVersion = remoteFilesVersion;
              logger.info({ total: remoteFiles.size, files: remoteFiles.keys() }, "✍️  wrote remote file changes");
            })
            .catch(this.stop);
        },
      }
    );

    logger.info("📡 set up remote file subscription");

    logger.debug("👀 setting up local file watcher...");

    const localFilesBuffer = new Map<string, { mode: number; mtime: number } | false>();

    this.publish = debounce(() => {
      const localFiles = new Map(localFilesBuffer.entries());
      localFilesBuffer.clear();

      void this.queue
        .add(async () => {
          const changed: FileSyncChangedEventInput[] = [];
          const deleted: FileSyncDeletedEventInput[] = [];

          await pMap(
            localFiles,
            async ([filepath, file]) => {
              if (file) {
                try {
                  changed.push({
                    path: normalizePath(this.relative(filepath)),
                    mode: file.mode,
                    content: await fs.readFile(filepath, "utf-8"),
                  });
                } catch (error) {
                  // A file could have been changed and then deleted before we process the change event, so the readFile above will raise
                  // an ENOENT. This is normal operation, so just ignore this event.
                  ignoreEnoent(error);
                }
              } else {
                deleted.push({ path: normalizePath(this.relative(filepath)) });
              }
            },
            { stopOnError: false }
          );

          if (changed.length > 0 || deleted.length > 0) {
            const files = [...changed, ...deleted].map((e) => e.path);
            logger.debug({ total: files.length, files }, "🚀 sending local file changes...");

            const data = await this.client.unwrapQuery({
              query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
              variables: { input: { expectedRemoteFilesVersion: this.metadata.lastWritten.filesVersion, changed, deleted } },
            });

            const { remoteFilesVersion } = data.publishFileSyncEvents;
            logger.debug({ remoteFilesVersion }, "remote files version after publishing");

            if (BigInt(remoteFilesVersion) > BigInt(this.metadata.lastWritten.filesVersion)) {
              this.metadata.lastWritten.filesVersion = remoteFilesVersion;
            }

            logger.info({ total: files.length, files }, "🚀 sent local file changes");
          }
        })
        .catch(this.stop);
    }, this.filePushDelay);

    this.watcher
      .add(`${this.dir}/**/*`)
      .on("error", (error) => void this.stop(error))
      .on("all", (event, filepath, stats) => {
        if (event === "addDir") {
          logger.trace({ path: this.relative(filepath), event, mode: stats?.mode }, "👀 skipping event caused by added directory");
          return;
        }

        if (stats?.isSymbolicLink?.()) {
          logger.trace({ path: this.relative(filepath), event, mode: stats.mode }, "👀 skipping event caused by symlink");
          return;
        }

        if (filepath == this.ignorer.filepath) {
          this.ignorer.reload();
        } else if (this.ignorer.ignores(filepath)) {
          logger.trace({ path: this.relative(filepath), event, mode: stats?.mode }, "👀 skipping event caused by ignored file");
          return;
        }

        // we only update the lastWritten.mtime if the file is not ignored, because if we restart and the lastWritten.mtime is set to an
        // ignored file, then it *could* be greater than the mtime of all non ignored files and we'll think that local files have
        // changed when only an ignored one has
        if (stats && stats.mtime.getTime() > this.metadata.lastWritten.mtime) {
          this.metadata.lastWritten.mtime = stats.mtime.getTime();
        }

        if (this.recentWrites.delete(filepath)) {
          logger.trace({ path: this.relative(filepath), event, mode: stats?.mode }, "👀 skipping event caused by recent write");
          return;
        }

        logger.trace({ path: this.relative(filepath), event, mode: stats?.mode }, "👀 file changed");

        switch (event) {
          case "add":
          case "change":
            assert(stats, "missing stats on add/change event");
            localFilesBuffer.set(filepath, { mode: stats.mode, mtime: stats.mtime.getTime() });
            break;
          case "unlink":
          case "unlinkDir":
            localFilesBuffer.set(filepath, false);
            break;
        }

        this.publish();
      });

    logger.info("👀 set up local file watcher");

    await sleepUntil(() => this.stopping, { timeout: Infinity });
  }
}

export enum Action {
  CANCEL = "Cancel sync and do nothing",
  MERGE = "Merge local files with remote",
  RESET = "Reset local files to remote",
}

export const REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION: Query<
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables
> = /* GraphQL */ `
  subscription RemoteFileSyncEvents($localFilesVersion: String!) {
    remoteFileSyncEvents(localFilesVersion: $localFilesVersion) {
      remoteFilesVersion
      changed {
        path
        mode
        content
      }
      deleted {
        path
      }
    }
  }
`;

export const REMOTE_FILES_VERSION_QUERY: Query<RemoteFilesVersionQuery, RemoteFilesVersionQueryVariables> = /* GraphQL */ `
  query RemoteFilesVersion {
    remoteFilesVersion
  }
`;

export const PUBLISH_FILE_SYNC_EVENTS_MUTATION: Query<
  PublishFileSyncEventsMutation,
  PublishFileSyncEventsMutationVariables
> = /* GraphQL */ `
  mutation PublishFileSyncEvents($input: PublishFileSyncEventsInput!) {
    publishFileSyncEvents(input: $input) {
      remoteFilesVersion
    }
  }
`;
