import { Flags } from "@oclif/core";
import type { OptionFlag } from "@oclif/core/lib/interfaces";
import assert from "assert";
import { FSWatcher } from "chokidar";
import execa from "execa";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import { prompt } from "inquirer";
import type { DebouncedFunc } from "lodash";
import { debounce } from "lodash";
import normalizePath from "normalize-path";
import pMap from "p-map";
import PQueue from "p-queue";
import path from "path";
import dedent from "ts-dedent";
import { TextDecoder, TextEncoder } from "util";
import which from "which";
import { BaseCommand } from "../lib/base-command";
import type { Query } from "../lib/client";
import { InvalidSyncFileError, YarnNotFoundError } from "../lib/errors";
import { ignoreEnoent, Ignorer, isEmptyDir, walkDir } from "../lib/fs-utils";
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
  static override priority = 1;

  static override summary = "Sync your Gadget application's source code to and from your local filesystem.";

  static override usage = "sync --app <name> [DIRECTORY]";

  static override description = dedent`
    Sync provides the ability to sync your Gadget application's source code to and from your local
    filesystem. While \`ggt sync\` is running, local file changes are immediately reflected within
    Gadget, while files that are changed remotely are immediately saved to your local filesystem.

    Use cases for this include:
      * Developing locally with your own editor like VSCode (https://code.visualstudio.com/)
      * Storing your source code in a Git repository like GitHub (https://github.com/)

    Sync includes the concept of a \`.ignore\` file. This file can contain a list of files and
    directories that won't be sent to Gadget when syncing.

    The following files and directories are always ignored:
      * .gadget
      * .ggt
      * .git
      * node_modules

    Note:
      * Gadget applications only support installing dependencies with Yarn 1 (https://classic.yarnpkg.com/lang/en/).
      * Since file changes are immediately reflected in Gadget, avoid the following while \`ggt sync\` is running:
          * Deleting all your files
          * Moving all your files to a different directory
  `;

  static override args = [
    {
      name: "directory",
      description: "The directory to sync files to. If the directory doesn't exist, it will be created.",
      default: ".",
    },
  ];

  static override flags = {
    force: Flags.boolean({
      summary: "Sync even if we can't determine the state of your local files relative to your remote ones.",
      default: false,
    }),
    "file-push-delay": Flags.integer({
      summary: "Delay in milliseconds before pushing files to your app.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
      hidden: true,
    }) as OptionFlag<number>,
    "file-stability-threshold": Flags.integer({
      name: "file-stability-threshold",
      summary: "Time in milliseconds a file's size must remain the same.",
      helpGroup: "file",
      helpValue: "ms",
      default: 500,
      hidden: true,
    }) as OptionFlag<number>,
    "file-poll-interval": Flags.integer({
      name: "file-poll-interval",
      description: "Interval in milliseconds between polling a file's size.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
      hidden: true,
    }) as OptionFlag<number>,
  };

  static override examples = [
    dedent`
      $ ggt sync --app my-app ~/gadget/my-app
      Ready
      Received
      ← routes/GET.js
      ← user/signUp/signIn.js
      Sent
      → routes/GET.js
      ^C Stopping... (press Ctrl+C again to force)
      Done
    `,
    dedent`
      # These are equivalent
      $ ggt sync -A my-app
      $ ggt sync --app my-app
      $ ggt sync --app my-app.gadget.app
      $ ggt sync --app https://my-app.gadget.app
      $ ggt sync --app https://my-app.gadget.app/edit
    `,
  ];

  override readonly requireApp = true;

  status = SyncStatus.STARTING;

  dir!: string;

  recentWrites = new Set();

  encoder = new TextEncoder();

  decoder = new TextDecoder();

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

  stop!: (error?: unknown) => Promise<void>;

  relative(to: string): string {
    return path.relative(this.dir, to);
  }

  absolute(...pathSegments: string[]): string {
    return path.resolve(this.dir, ...pathSegments);
  }

  normalize(filepath: string): string {
    return normalizePath(path.isAbsolute(filepath) ? this.relative(filepath) : filepath);
  }

  logPaths(filepaths: string[], { limit = 10, sep = "-" } = {}): void {
    let logged = 0;
    for (const filepath of filepaths) {
      this.log(`${sep} ${this.normalize(filepath)}`);
      if (++logged == limit && !this.debugEnabled) break;
    }

    if (filepaths.length > logged) {
      this.log(`… ${filepaths.length - logged} more`);
    }
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

    this.debug("starting");

    if (!which.sync("yarn", { nothrow: true })) {
      throw new YarnNotFoundError();
    }

    await fs.ensureDir(this.dir);

    if (!(await isEmptyDir(this.dir))) {
      try {
        this.metadata = await fs.readJson(this.absolute(".ggt", "sync.json"));
      } catch (error) {
        if (!flags.force) {
          throw new InvalidSyncFileError(error, this.dir, this.app);
        }
      }
    }

    const { remoteFilesVersion } = await this.client.queryUnwrap({ query: REMOTE_FILES_VERSION_QUERY });
    const hasRemoteChanges = BigInt(remoteFilesVersion) > BigInt(this.metadata.lastWritten.filesVersion);

    const getChangedFiles = async (): Promise<Map<string, Stats>> => {
      const files = new Map();
      for await (const filepath of walkDir(this.dir, { ignorer: this.ignorer })) {
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
      this.log("Local files have changed since the last sync");
      this.logPaths(Array.from(changedFiles.keys()), { limit: changedFiles.size });
      this.log();
    }

    this.debug("init %o", { metadata: this.metadata, remoteFilesVersion, hasRemoteChanges, hasLocalChanges });

    let action: Action | undefined;
    if (hasLocalChanges) {
      ({ action } = await prompt({
        type: "list",
        name: "action",
        choices: [Action.CANCEL, Action.MERGE, Action.RESET],
        message: hasRemoteChanges ? "Remote files have also changed. How would you like to proceed?" : "How would you like to proceed?",
      }));
    }

    switch (action) {
      case Action.MERGE: {
        // get all the changed files again in case more changed
        const files = await getChangedFiles();

        // we purposefully don't set the returned remoteFilesVersion here because we haven't processed the in-between versions yet
        await this.client.queryUnwrap({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: {
            input: {
              expectedRemoteFilesVersion: remoteFilesVersion,
              changed: await pMap(files, async ([filepath, stats]) => {
                if (stats.mtime.getTime() > this.metadata.lastWritten.mtime) {
                  this.metadata.lastWritten.mtime = stats.mtime.getTime();
                }

                return {
                  path: this.normalize(filepath),
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

    this.debug("started");
  }

  async run(): Promise<void> {
    let error: unknown;

    this.stop = async (e?: unknown) => {
      if (this.status != SyncStatus.RUNNING) return;

      error = e;
      this.debug("stopping");
      this.status = SyncStatus.STOPPING;

      try {
        unsubscribe();
        this.watcher.removeAllListeners();
        this.publish.flush();
        await this.queue.onIdle();
      } finally {
        await fs.outputJSON(this.absolute(".ggt", "sync.json"), this.metadata, { spaces: 2 });
        await Promise.allSettled([this.watcher.close(), this.client.dispose()]);

        this.debug("stopped");
        this.status = SyncStatus.STOPPED;
      }
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        if (this.status != SyncStatus.RUNNING) return;

        this.log(" Stopping... (press Ctrl+C again to force)");

        // When ggt is run via npx, and the user presses Ctrl+C, npx sends SIGINT twice in quick succession. In order to prevent the second
        // SIGINT from triggering the force exit listener, we wait a bit before registering it. This is a bit of a hack, but it works.
        setTimeout(() => {
          process.once("SIGINT", () => {
            this.log(" Exiting immediately. Note that files may not have finished syncing.");
            process.exit(1);
          });
        }, 100).unref();

        void this.stop();
      });
    }

    const unsubscribe = this.client.subscribeUnwrap(
      {
        query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
        variables: () => ({ localFilesVersion: this.metadata.lastWritten.filesVersion }),
      },
      {
        error: (error) => void this.stop(error),
        next: ({ remoteFileSyncEvents }) => {
          if (!remoteFileSyncEvents.changed.length && !remoteFileSyncEvents.deleted.length) {
            return;
          }

          const { remoteFilesVersion, changed, deleted } = remoteFileSyncEvents;
          const remoteFiles = new Map([...deleted, ...changed].map((e) => [e.path, e]));

          void this.queue
            .add(async () => {
              this.log("Received");
              this.logPaths(Array.from(remoteFiles.keys()), { sep: "←" });

              await pMap(
                remoteFiles,
                async ([relativePath, file]) => {
                  const filepath = this.absolute(relativePath);
                  this.recentWrites.add(filepath);

                  if ("content" in file) {
                    await fs.ensureDir(path.dirname(filepath), { mode: 0o755 });
                    if (!file.path.endsWith("/")) await fs.writeFile(filepath, this.encoder.encode(file.content), { mode: file.mode });
                    if (filepath == this.absolute("yarn.lock")) await execa("yarn", ["install"], { cwd: this.dir });
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
            })
            .catch(this.stop);
        },
      }
    );

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
                    path: this.normalize(filepath),
                    mode: file.mode,
                    content: this.decoder.decode(await fs.readFile(filepath)),
                  });
                } catch (error) {
                  // A file could have been changed and then deleted before we process the change event, so the readFile above will raise
                  // an ENOENT. This is normal operation, so just ignore this event.
                  ignoreEnoent(error);
                }
              } else {
                deleted.push({ path: this.normalize(filepath) });
              }
            },
            { stopOnError: false }
          );

          if (changed.length > 0 || deleted.length > 0) {
            this.log("Sent");
            this.logPaths(Array.from(localFiles.keys()), { sep: "→" });

            const data = await this.client.queryUnwrap({
              query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
              variables: { input: { expectedRemoteFilesVersion: this.metadata.lastWritten.filesVersion, changed, deleted } },
            });

            const { remoteFilesVersion } = data.publishFileSyncEvents;
            this.debug("remote files version after publishing %s", remoteFilesVersion);

            if (BigInt(remoteFilesVersion) > BigInt(this.metadata.lastWritten.filesVersion)) {
              this.metadata.lastWritten.filesVersion = remoteFilesVersion;
            }
          }
        })
        .catch(this.stop);
    }, this.filePushDelay);

    this.watcher
      .add(`${this.dir}/**/*`)
      .on("error", (error) => void this.stop(error))
      .on("all", (event, filepath, stats) => {
        const relativePath = this.relative(filepath);

        if (event === "addDir") {
          this.debug("skipping event caused by added directory %s", relativePath);
          return;
        }

        if (stats?.isSymbolicLink?.()) {
          this.debug("skipping event caused by symlink %s", relativePath);
          return;
        }

        if (filepath == this.ignorer.filepath) {
          this.ignorer.reload();
        } else if (this.ignorer.ignores(filepath)) {
          this.debug("skipping event caused by ignored file %s", relativePath);
          return;
        }

        // we only update the lastWritten.mtime if the file is not ignored, because if we restart and the lastWritten.mtime is set to an
        // ignored file, then it *could* be greater than the mtime of all non ignored files and we'll think that local files have
        // changed when only an ignored one has
        if (stats && stats.mtime.getTime() > this.metadata.lastWritten.mtime) {
          this.metadata.lastWritten.mtime = stats.mtime.getTime();
        }

        if (this.recentWrites.delete(filepath)) {
          this.debug("skipping event caused by recent write %s", relativePath);
          return;
        }

        this.debug("file changed %s", relativePath);

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

    this.log("Ready");
    this.status = SyncStatus.RUNNING;

    await sleepUntil(() => this.status == SyncStatus.STOPPED, { timeout: Infinity });

    if (error) {
      this.notify({ subtitle: "Uh oh!", message: "An error occurred while syncing files" });
      throw error;
    } else {
      this.log("Done");
    }
  }
}

export enum SyncStatus {
  STARTING,
  RUNNING,
  STOPPING,
  STOPPED,
}

export enum Action {
  CANCEL = "Cancel (Ctrl+C)",
  MERGE = "Merge local files with remote ones",
  RESET = "Reset local files to remote ones",
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
