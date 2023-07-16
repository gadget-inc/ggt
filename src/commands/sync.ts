import { Args, Flags } from "@oclif/core";
import assert from "assert";
import chalkTemplate from "chalk-template";
import { format } from "date-fns";
import { execa } from "execa";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import inquirer from "inquirer";
import _ from "lodash";
import normalizePath from "normalize-path";
import pMap from "p-map";
import PQueue from "p-queue";
import path from "path";
import pluralize from "pluralize";
import { dedent } from "ts-dedent";
import FSWatcher from "watcher";
import which from "which";
import type {
  FileSyncChangedEventInput,
  FileSyncDeletedEventInput,
  PublishFileSyncEventsMutation,
  PublishFileSyncEventsMutationVariables,
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables,
  RemoteFilesVersionQuery,
  RemoteFilesVersionQueryVariables,
} from "../__generated__/graphql.js";
import { FileSyncEncoding } from "../__generated__/graphql.js";
import { BaseCommand } from "../services/base-command.js";
import type { Query } from "../services/client.js";
import { Client } from "../services/client.js";
import { context } from "../services/context.js";
import { InvalidSyncAppFlagError, InvalidSyncFileError, YarnNotFoundError } from "../services/errors.js";
import { app } from "../services/flags.js";
import { FSIgnorer, ignoreEnoent, isEmptyDir, walkDir } from "../services/fs-utils.js";
import { PromiseSignal } from "../services/promise.js";

export default class Sync extends BaseCommand<typeof Sync> {
  static override priority = 1;

  static override summary = "Sync your Gadget application's source code to and from your local filesystem.";

  static override usage = "sync [DIRECTORY] [--app <name>]";

  static override description = dedent(chalkTemplate`
    Sync provides the ability to sync your Gadget application's source code to and from your local
    filesystem. While {gray ggt sync} is running, local file changes are immediately reflected within
    Gadget, while files that are changed remotely are immediately saved to your local filesystem.

    Use cases for this include:
      - Developing locally with your own editor like VSCode {gray (https://code.visualstudio.com/)}
      - Storing your source code in a Git repository like GitHub {gray (https://github.com/)}

    Sync includes the concept of a {gray .ignore} file. This file may contain a list of files and
    directories that won't be received or sent to Gadget when syncing. The format of this file is
    identical to the one used by Git {gray (https://git-scm.com/docs/gitignore)}.

    The following files and directories are always ignored:
      - .gadget
      - .git
      - node_modules

    Note:
      - If you have separate development and production environments, {gray ggt sync} will only sync with your development environment
      - Gadget applications only support installing dependencies with Yarn 1 {gray (https://classic.yarnpkg.com/lang/en/)}
      - Since file changes are immediately reflected in Gadget, avoid the following while {gray ggt sync} is running:
          - Deleting all your files
          - Moving all your files to a different directory
  `);

  static override args = {
    directory: Args.string({
      description: "The directory to sync files to. If the directory doesn't exist, it will be created.",
      default: ".",
    }),
  };

  static override flags = {
    app: app({
      summary: "The Gadget application to sync files to.",
    }),
    force: Flags.boolean({
      summary: "Whether to sync even if we can't determine the state of your local files relative to your remote ones.",
      default: false,
    }),
    "file-push-delay": Flags.integer({
      summary: "Delay in milliseconds before pushing files to your app.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
      hidden: true,
    }),
    // The following flags are passed to FSWatcher (https://github.com/fabiospampinato/watcher)
    "file-watch-debounce": Flags.integer({
      summary: "Amount of milliseconds to debounce file changed events",
      helpGroup: "file",
      helpValue: "ms",
      default: 300,
      hidden: true,
    }),
    "file-watch-poll-interval": Flags.integer({
      summary:
        "Polling is used as a last resort measure when watching non-existent paths inside non-existent directories, this controls how often polling is performed, in milliseconds. You can set it to a lower value to make the app detect events much more quickly, but don't set it too low if you are watching many paths that require polling as polling is expensive.",
      helpGroup: "file",
      helpValue: "ms",
      default: 3_000,
      hidden: true,
    }),
    "file-watch-poll-timeout": Flags.integer({
      summary:
        "Sometimes polling will fail, for example if there are too many file descriptors currently open, usually eventually polling will succeed after a few tries though, this controls the amount of milliseconds the library should keep retrying for.",
      helpGroup: "file",
      helpValue: "ms",
      default: 20_000,
      hidden: true,
    }),
    "file-watch-rename-timeout": Flags.integer({
      summary:
        "Amount of milliseconds to wait for a potential rename/renameDir event to be detected. The higher this value is the more reliably renames will be detected, but don't set this too high, or the emission of some events could be delayed by that amount. The higher this value is the longer the library will take to emit add/addDir/unlink/unlinkDir events.",
      helpGroup: "file",
      helpValue: "ms",
      default: 1_250,
      hidden: true,
    }),
  };

  static override examples = [
    dedent(chalkTemplate`
      {gray $ ggt sync --app my-app ~/gadget/my-app}

      App         my-app
      Editor      https://my-app.gadget.app/edit
      Playground  https://my-app.gadget.app/api/graphql/playground
      Docs        https://docs.gadget.dev/api/my-app

      {underline Endpoints}
        - https://my-app.gadget.app
        - https://my-app--development.gadget.app

      Watching for file changes... {gray Press Ctrl+C to stop}

      Received {gray 12:00:00 PM}
      {green ←} routes/GET.js {gray (changed)}
      {green ←} user/signUp/signIn.js {gray (changed)}
      {gray 2 files in total. 2 changed, 0 deleted.}

      Sent {gray 12:00:03 PM}
      {green →} routes/GET.ts {gray (changed)}
      {gray 1 file in total. 1 changed, 0 deleted.}

      ^C Stopping... {gray (press Ctrl+C again to force)}
      Goodbye!
    `),
  ];

  override requireUser = true;

  /**
   * The current status of the sync process.
   */
  status = SyncStatus.STARTING;

  /**
   * The absolute path to the directory to sync files to.
   */
  dir!: string;

  /**
   * A list of filepaths that have changed because of a remote file-sync event. This is used to avoid sending files that
   * we recently received from a remote file-sync event.
   */
  recentRemoteChanges = new Set<string>();

  /**
   * A FIFO async callback queue that ensures we process file-sync events in the order they occurred.
   */
  queue = new PQueue({ concurrency: 1 });

  /**
   * A GraphQL client connected to the app's /edit/api/graphql-ws endpoint
   */
  client!: Client;

  /**
   * Loads the .ignore file and provides methods for checking if a file should be ignored.
   */
  ignorer!: FSIgnorer;

  /**
   * Watches the local filesystem for changes.
   */
  watcher!: FSWatcher;

  /**
   * The state of the local filesystem.
   */
  state!: SyncState;

  /**
   * A debounced function that enqueue's local file changes to be sent to Gadget.
   */
  publish!: _.DebouncedFunc<() => void>;

  /**
   * Gracefully stops the sync.
   */
  stop!: (error?: unknown) => Promise<void>;

  /**
   * Turns an absolute filepath into a relative one from {@linkcode dir}.
   */
  relative(to: string): string {
    return path.relative(this.dir, to);
  }

  /**
   * Combines path segments into an absolute filepath that starts at {@linkcode dir}.
   */
  absolute(...pathSegments: string[]): string {
    return path.resolve(this.dir, ...pathSegments);
  }

  /**
   * Similar to {@linkcode relative} in that it turns a filepath into a relative one from {@linkcode dir}. However, it
   * also changes any slashes to be posix/unix-like forward slashes, condenses repeated slashes into a single slash, and
   * adds a trailing slash if the filepath is a directory.
   *
   * This is used when sending file-sync events to Gadget to ensure that the paths are consistent across platforms.
   *
   * @see https://www.npmjs.com/package/normalize-path
   */
  normalize(filepath: string, isDirectory: boolean): string {
    return normalizePath(path.isAbsolute(filepath) ? this.relative(filepath) : filepath) + (isDirectory ? "/" : "");
  }

  /**
   * Instead of deleting files, we move them to .gadget/backup so that users can recover them if something goes wrong.
   */
  async softDelete(normalizedPath: string): Promise<void> {
    try {
      await fs.move(this.absolute(normalizedPath), this.absolute(".gadget/backup", normalizedPath), {
        overwrite: true,
      });
    } catch (error) {
      // replicate the behavior of `rm -rf` and ignore ENOENT
      ignoreEnoent(error);
    }
  }

  /**
   * Pretty-prints changed and deleted filepaths to the console.
   *
   * @param prefix The prefix to print before each line.
   * @param changed The normalized paths that have changed.
   * @param deleted The normalized paths that have been deleted.
   * @param options.limit The maximum number of lines to print. Defaults to 10. If debug is enabled, this is ignored.
   */
  logPaths(prefix: string, changed: string[], deleted: string[], { limit = 10 } = {}): void {
    const lines = _.sortBy(
      [
        ..._.map(changed, (normalizedPath) => chalkTemplate`{green ${prefix}} ${normalizedPath} {gray (changed)}`),
        ..._.map(deleted, (normalizedPath) => chalkTemplate`{red ${prefix}} ${normalizedPath} {gray (deleted)}`),
      ],
      (line) => line.slice(line.indexOf(" ") + 1),
    );

    let logged = 0;
    for (const line of lines) {
      this.log(line);
      if (++logged == limit && !this.debugEnabled) break;
    }

    if (lines.length > logged) {
      this.log(chalkTemplate`{gray … ${lines.length - logged} more}`);
    }

    this.log(
      chalkTemplate`{gray ${pluralize("file", lines.length, true)} in total. ${changed.length} changed, ${deleted.length} deleted.}`,
    );
    this.log();
  }

  /**
   * Initializes the sync process.
   * - Ensures the directory exists.
   * - Ensures the directory is empty or contains a `.gadget/sync.json` file.
   * - Ensures an app is selected and that it matches the app the directory was previously synced to.
   * - Ensures yarn v1 is installed.
   * - Prompts the user how to resolve conflicts if the local filesystem has changed since the last sync.
   */
  override async init(): Promise<void> {
    await super.init();

    this.dir =
      this.config.windows && _.startsWith(this.args.directory, "~/")
        ? path.join(this.config.home, this.args.directory.slice(2))
        : path.resolve(this.args.directory);

    const getApp = async (): Promise<string> => {
      if (this.flags.app) {
        return this.flags.app;
      }

      // this.state can be undefined if the user is running `ggt sync` for the first time
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.state?.app) {
        return this.state.app;
      }

      const selected = await inquirer.prompt<{ app: string }>({
        type: "list",
        name: "app",
        message: "Please select the app to sync to.",
        choices: await context.getAvailableApps().then((apps) => _.map(apps, "slug")),
      });

      return selected.app;
    };

    if (await isEmptyDir(this.dir)) {
      const app = await getApp();
      this.state = SyncState.create(this.dir, { app });
    } else {
      try {
        this.state = SyncState.load(this.dir);
      } catch (error) {
        if (!this.flags.force) {
          throw new InvalidSyncFileError(error, this, this.flags.app);
        }
        const app = await getApp();
        this.state = SyncState.create(this.dir, { app });
      }
    }

    if (this.flags.app && this.flags.app !== this.state.app && !this.flags.force) {
      throw new InvalidSyncAppFlagError(this);
    }

    await context.setApp(this.state.app);

    this.client = new Client();

    // local files/folders that should never be published
    this.ignorer = new FSIgnorer(this.dir, ["node_modules", ".gadget", ".git"]);

    if (!which.sync("yarn", { nothrow: true })) {
      throw new YarnNotFoundError();
    }

    await fs.ensureDir(this.dir);

    const { remoteFilesVersion } = await this.client.queryUnwrap({ query: REMOTE_FILES_VERSION_QUERY });
    const hasRemoteChanges = BigInt(remoteFilesVersion) > BigInt(this.state.filesVersion);

    const getChangedFiles = async (): Promise<Map<string, Stats>> => {
      const files = new Map();
      for await (const absolutePath of walkDir(this.dir, { ignorer: this.ignorer })) {
        const stats = await fs.stat(absolutePath);
        if (stats.mtime.getTime() > this.state.mtime) {
          files.set(this.normalize(absolutePath, stats.isDirectory()), stats);
        }
      }

      // never include the root directory
      files.delete("/");

      return files;
    };

    let changedFiles = await getChangedFiles();
    const hasLocalChanges = changedFiles.size > 0;
    if (hasLocalChanges) {
      this.log("Local files have changed since you last synced");
      this.logPaths("-", Array.from(changedFiles.keys()), [], { limit: changedFiles.size });
      this.log();
    }

    context.addBreadcrumb({
      category: "sync",
      message: "Initializing",
      data: {
        state: this.state,
        remoteFilesVersion,
        hasRemoteChanges,
        hasLocalChanges,
        changed: Array.from(changedFiles.keys()),
      },
    });

    let action: Action | undefined;
    if (hasLocalChanges) {
      ({ action } = await inquirer.prompt({
        type: "list",
        name: "action",
        choices: [Action.CANCEL, Action.MERGE, Action.RESET],
        message: hasRemoteChanges ? "Remote files have also changed. How would you like to proceed?" : "How would you like to proceed?",
      }));
    }

    // get all the changed files again in case more changed
    changedFiles = await getChangedFiles();

    switch (action) {
      case Action.MERGE: {
        context.addBreadcrumb({
          category: "sync",
          message: "Merging local changes",
          data: {
            state: this.state,
            remoteFilesVersion,
            changed: Array.from(changedFiles.keys()),
          },
        });

        // We purposefully don't set the returned remoteFilesVersion here because we haven't received the remote changes
        // yet. This will cause us to receive the local files that we just published + the remote files that were
        // changed since the last sync.
        await this.client.queryUnwrap({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: {
            input: {
              expectedRemoteFilesVersion: remoteFilesVersion,
              changed: await pMap(changedFiles, async ([normalizedPath, stats]) => {
                if (stats.mtime.getTime() > this.state.mtime) {
                  this.state.mtime = stats.mtime.getTime();
                }

                return {
                  path: normalizedPath,
                  mode: stats.mode,
                  content: stats.isDirectory() ? "" : await fs.readFile(this.absolute(normalizedPath), "base64"),
                  encoding: FileSyncEncoding.Base64,
                };
              }),
              deleted: [],
            },
          },
        });
        break;
      }
      case Action.RESET: {
        context.addBreadcrumb({
          category: "sync",
          message: "Resetting local changes",
          data: {
            state: this.state,
            remoteFilesVersion,
            changed: Array.from(changedFiles.keys()),
          },
        });

        // delete all the local files that have changed since the last sync and set the files version to 0 so we receive
        // all the remote files again, including any files that we just deleted that still exist
        await pMap(changedFiles.keys(), (normalizedPath) => this.softDelete(normalizedPath));
        this.state.filesVersion = 0n;
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }

    context.addBreadcrumb({
      category: "sync",
      message: "Initialized",
      data: {
        state: this.state,
      },
    });
  }

  /**
   * Runs the sync process until it is stopped or an error occurs.
   */
  async run(): Promise<void> {
    let error: unknown;
    const stopped = new PromiseSignal();

    this.stop = async (e?: unknown) => {
      if (this.status != SyncStatus.RUNNING) return;

      this.status = SyncStatus.STOPPING;
      error = e;

      context.addBreadcrumb({
        category: "sync",
        message: "Stopping",
        level: error ? "error" : undefined,
        data: {
          state: this.state,
          error,
        },
      });

      try {
        unsubscribe();
        this.watcher.removeAllListeners();
        this.publish.flush();
        await this.queue.onIdle();
      } finally {
        this.state.flush();
        await Promise.allSettled([this.watcher.close(), this.client.dispose()]);

        this.status = SyncStatus.STOPPED;
        stopped.resolve();

        context.addBreadcrumb({
          category: "sync",
          message: "Stopped",
          data: {
            state: this.state,
          },
        });
      }
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        if (this.status != SyncStatus.RUNNING) return;

        this.log(chalkTemplate` Stopping... {gray (press Ctrl+C again to force)}`);
        void this.stop();

        // When ggt is run via npx, and the user presses Ctrl+C, npx sends SIGINT twice in quick succession. In order to prevent the second
        // SIGINT from triggering the force exit listener, we wait a bit before registering it. This is a bit of a hack, but it works.
        setTimeout(() => {
          process.once(signal, () => {
            this.log(" Exiting immediately. Note that files may not have finished syncing.");
            process.exit(1);
          });
        }, 100).unref();
      });
    }

    const unsubscribe = this.client.subscribeUnwrap(
      {
        query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
        variables: () => ({ localFilesVersion: String(this.state.filesVersion) }),
      },
      {
        error: (error) => void this.stop(error),
        next: ({ remoteFileSyncEvents }) => {
          context.addBreadcrumb({
            category: "sync",
            message: "Received file sync events",
            data: {
              state: this.state,
              remoteFilesVersion: remoteFileSyncEvents.remoteFilesVersion,
              changed: _.map(remoteFileSyncEvents.changed, "path"),
              deleted: _.map(remoteFileSyncEvents.deleted, "path"),
            },
          });

          const remoteFilesVersion = remoteFileSyncEvents.remoteFilesVersion;

          // we always ignore .gadget/ files so that we don't publish them (they're managed by gadget), but we still want to receive them
          const filter = (event: { path: string }) => _.startsWith(event.path, ".gadget/") || !this.ignorer.ignores(event.path);
          const changed = _.filter(remoteFileSyncEvents.changed, filter);
          const deleted = _.filter(remoteFileSyncEvents.deleted, filter);

          this._enqueue(async () => {
            context.addBreadcrumb({
              category: "sync",
              message: "Processing received file sync events",
              data: {
                state: this.state,
                remoteFilesVersion: remoteFileSyncEvents.remoteFilesVersion,
                changed: _.map(remoteFileSyncEvents.changed, "path"),
                deleted: _.map(remoteFileSyncEvents.deleted, "path"),
              },
            });

            if (!changed.length && !deleted.length) {
              if (BigInt(remoteFilesVersion) > this.state.filesVersion) {
                // we still need to update filesVersion, otherwise our expectedFilesVersion will be behind the next time we publish
                this.state.filesVersion = remoteFilesVersion;
                context.addBreadcrumb({
                  category: "sync",
                  message: "Received empty file sync events",
                  data: {
                    state: this.state,
                    remoteFilesVersion: remoteFileSyncEvents.remoteFilesVersion,
                  },
                });
              }
              return;
            }

            this.log(chalkTemplate`Received {gray ${format(new Date(), "pp")}}`);
            this.logPaths("←", _.map(changed, "path"), _.map(deleted, "path"));

            // we need to processed deleted files first as we may delete an empty directory after a file has been put
            // into it. if processed out of order the new file will be deleted as well
            await pMap(deleted, async (file) => {
              this.recentRemoteChanges.add(file.path);
              await this.softDelete(file.path);
            });

            await pMap(changed, async (file) => {
              this.recentRemoteChanges.add(file.path);

              const absolutePath = this.absolute(file.path);
              if (_.endsWith(file.path, "/")) {
                await fs.ensureDir(absolutePath, { mode: 0o755 });
                return;
              }

              // we need to add all parent directories to recentRemoteChanges so that we don't re-publish them
              for (const dir of _.split(path.dirname(file.path), "/")) {
                this.recentRemoteChanges.add(dir + "/");
              }

              await fs.ensureDir(path.dirname(absolutePath), { mode: 0o755 });
              await fs.writeFile(absolutePath, Buffer.from(file.content, file.encoding), { mode: file.mode });

              if (absolutePath == this.absolute("yarn.lock")) {
                await execa("yarn", ["install"], { cwd: this.dir }).catch((error) => {
                  context.addBreadcrumb({
                    category: "sync",
                    message: "Yarn install failed",
                    level: "error",
                    data: {
                      state: this.state,
                      error,
                    },
                  });
                });
              }

              if (absolutePath == this.ignorer.filepath) {
                this.ignorer.reload();
              }
            });

            this.state.filesVersion = remoteFilesVersion;

            // always remove the root directory from recentRemoteChanges
            this.recentRemoteChanges.delete("./");

            // remove any files in recentRemoteChanges that are ignored (e.g. .gadget/ files)
            for (const filepath of this.recentRemoteChanges) {
              if (this.ignorer.ignores(filepath)) {
                this.recentRemoteChanges.delete(filepath);
              }
            }

            context.addBreadcrumb({
              category: "sync",
              message: "Processed received file sync events",
              data: {
                state: this.state,
                remoteFilesVersion: remoteFileSyncEvents.remoteFilesVersion,
                changed: _.map(remoteFileSyncEvents.changed, "path"),
                deleted: _.map(remoteFileSyncEvents.deleted, "path"),
                recentRemoteChanges: Array.from(this.recentRemoteChanges.keys()),
              },
            });
          });
        },
      },
    );

    const localFilesBuffer = new Map<
      string,
      | { mode: number; isDirectory: boolean }
      | { isDeleted: true; isDirectory: boolean }
      | { mode: number; oldPath: string; newPath: string; isDirectory: boolean }
    >();

    this.publish = _.debounce(() => {
      const localFiles = new Map(localFilesBuffer.entries());
      localFilesBuffer.clear();

      this._enqueue(async () => {
        context.addBreadcrumb({
          category: "sync",
          message: "Publishing file sync events",
          data: {
            state: this.state,
            localFiles: Array.from(localFiles.keys()),
          },
        });

        const changed: FileSyncChangedEventInput[] = [];
        const deleted: FileSyncDeletedEventInput[] = [];

        await pMap(localFiles, async ([normalizedPath, file]) => {
          if ("isDeleted" in file) {
            deleted.push({ path: normalizedPath });
            return;
          }

          try {
            changed.push({
              path: normalizedPath,
              oldPath: "oldPath" in file ? file.oldPath : undefined,
              mode: file.mode,
              content: file.isDirectory ? "" : await fs.readFile(this.absolute(normalizedPath), FileSyncEncoding.Base64),
              encoding: FileSyncEncoding.Base64,
            });
          } catch (error) {
            // A file could have been changed and then deleted before we process the change event, so the readFile
            // above will raise an ENOENT. This is normal operation, so just ignore this event.
            ignoreEnoent(error);
          }
        });

        if (!changed.length && !deleted.length) {
          return;
        }

        const { publishFileSyncEvents } = await this.client.queryUnwrap({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: { input: { expectedRemoteFilesVersion: String(this.state.filesVersion), changed, deleted } },
        });

        context.addBreadcrumb({
          category: "sync",
          message: "Published file sync events",
          data: {
            state: this.state,
            remoteFilesVersion: publishFileSyncEvents.remoteFilesVersion,
            changed: _.map(changed, "path"),
            deleted: _.map(deleted, "path"),
          },
        });

        if (BigInt(publishFileSyncEvents.remoteFilesVersion) > this.state.filesVersion) {
          this.state.filesVersion = publishFileSyncEvents.remoteFilesVersion;
        }

        this.log(chalkTemplate`Sent {gray ${format(new Date(), "pp")}}`);
        this.logPaths("→", _.map(changed, "path"), _.map(deleted, "path"));
      });
    }, this.flags["file-push-delay"]);

    this.watcher = new FSWatcher(this.dir, {
      // paths that we never want to publish
      ignore: /(\.gadget|\.git|node_modules)/,
      // don't emit an event for every watched file on boot
      ignoreInitial: true,
      renameDetection: true,
      recursive: true,
      debounce: this.flags["file-watch-debounce"],
      pollingInterval: this.flags["file-watch-poll-interval"],
      pollingTimeout: this.flags["file-watch-poll-timeout"],
      renameTimeout: this.flags["file-watch-rename-timeout"],
    });

    this.watcher.once("error", (error) => void this.stop(error));

    this.watcher.on("all", (event: string, absolutePath: string, renamedPath: string) => {
      const filepath = event === "rename" || event === "renameDir" ? renamedPath : absolutePath;
      const isDirectory = event === "renameDir" || event === "addDir" || event === "unlinkDir";
      const normalizedPath = this.normalize(filepath, isDirectory);

      if (filepath == this.ignorer.filepath) {
        this.ignorer.reload();
      } else if (this.ignorer.ignores(filepath)) {
        this.debug("skipping event caused by ignored file %s", normalizedPath);
        return;
      }

      let stats: Stats | undefined;
      try {
        stats = fs.statSync(filepath);
      } catch (error) {
        ignoreEnoent(error);
      }

      // we only update the mtime if the file is not ignored, because if we restart and the mtime is set to an ignored
      // file, then it could be greater than the mtime of all non ignored files and we'll think that local files have
      // changed when only an ignored one has
      if (stats && stats.mtime.getTime() > this.state.mtime) {
        this.state.mtime = stats.mtime.getTime();
      }

      if (this.recentRemoteChanges.delete(normalizedPath)) {
        this.debug("skipping event caused by recent write %s", normalizedPath);
        return;
      }

      this.debug("%s %s", event, normalizedPath);

      switch (event) {
        case "add":
        case "change":
          assert(stats, "missing stats on add/change event");
          localFilesBuffer.set(normalizedPath, { mode: stats.mode, isDirectory: false });
          break;
        case "addDir":
          assert(stats, "missing stats on addDir event");
          localFilesBuffer.set(normalizedPath, { mode: stats.mode, isDirectory: true });
          break;
        case "unlinkDir":
        case "unlink":
          localFilesBuffer.set(normalizedPath, { isDeleted: true, isDirectory: event === "unlinkDir" });
          break;
        case "rename":
        case "renameDir":
          assert(stats, "missing stats on rename/renameDir event");
          localFilesBuffer.set(normalizedPath, {
            oldPath: this.normalize(absolutePath, isDirectory),
            newPath: normalizedPath,
            isDirectory: event === "renameDir",
            mode: stats.mode,
          });
          break;
      }

      this.publish();
    });

    this.status = SyncStatus.RUNNING;

    // app should be defined at this point
    assert(context.app);

    this.log();
    this.log(
      dedent(chalkTemplate`
      {bold ggt v${this.config.version}}

      App         ${context.app.slug}
      Editor      https://${context.app.slug}.gadget.app/edit
      Playground  https://${context.app.slug}.gadget.app/api/graphql/playground
      Docs        https://docs.gadget.dev/api/${context.app.slug}

      {underline Endpoints} ${
        context.app.hasSplitEnvironments
          ? `
        - https://${context.app.primaryDomain}
        - https://${context.app.slug}--development.gadget.app`
          : `
        - https://${context.app.primaryDomain}`
      }

      Watching for file changes... {gray Press Ctrl+C to stop}
    `),
    );
    this.log();

    await stopped;

    if (error) {
      this.notify({ subtitle: "Uh oh!", message: "An error occurred while syncing files" });
      throw error as Error;
    } else {
      this.log("Goodbye!");
    }
  }

  /**
   * Enqueues a function that handles file-sync events onto the {@linkcode queue}.
   *
   * @param fn The function to enqueue.
   */
  private _enqueue(fn: () => Promise<unknown>): void {
    void this.queue.add(fn).catch(this.stop);
  }
}

/**
 * Holds information about the state of the local filesystem. It's persisted to `.gadget/sync.json`.
 */
export class SyncState {
  private _inner: {
    app: string;
    filesVersion: string;
    mtime: number;
  };

  /**
   * Saves the current state of the filesystem to `.gadget/sync.json`.
   */
  #save = _.debounce(() => {
    fs.outputJSONSync(path.join(this._rootDir, ".gadget/sync.json"), this._inner, { spaces: 2 });
    context.addBreadcrumb({
      category: "sync",
      message: "Saved sync state",
      data: { state: this._inner },
    });
  }, 100);

  private constructor(
    private _rootDir: string,
    inner: { app: string; filesVersion: string; mtime: number },
  ) {
    this._inner = inner;
  }

  /**
   * The app this filesystem is synced to.
   */
  get app(): string {
    return this._inner.app;
  }

  /**
   * The last filesVersion that was successfully written to the filesystem. This is used to determine if the remote
   * filesystem is ahead of the local one.
   */
  get filesVersion(): bigint {
    return BigInt(this._inner.filesVersion);
  }

  set filesVersion(value: bigint | string) {
    this._inner.filesVersion = String(value);
    this.#save();
  }

  /**
   * The largest mtime that was seen on the local filesystem before `ggt sync` stopped. This is used to determine if
   * the local filesystem has changed since the last sync.
   *
   * Note: This does not include the mtime of files that are ignored.
   */
  // eslint-disable-next-line @typescript-eslint/member-ordering
  get mtime(): number {
    return this._inner.mtime;
  }

  set mtime(value: number) {
    this._inner.mtime = value;
    this.#save();
  }

  /**
   * Creates a new SyncFile instance and saves it to the filesystem.
   *
   * @param rootDir The root directory of the app.
   * @param app The app slug.
   * @returns A new SyncFile instance.
   */
  static create(rootDir: string, opts: { app: string; filesVersion?: string; mtime?: number }): SyncState {
    const state = new SyncState(rootDir, { filesVersion: "0", mtime: 0, ...opts });
    state.#save();
    state.flush();
    return state;
  }

  /**
   * Loads a SyncFile instance from the filesystem.
   *
   * @param rootDir The root directory of the app.
   * @returns The SyncFile instance.
   */
  static load(rootDir: string): SyncState {
    const state = fs.readJsonSync(path.join(rootDir, ".gadget/sync.json"));

    context.addBreadcrumb({
      category: "sync",
      message: "Loaded sync state",
      data: { state },
    });

    assert(_.isString(state.app), "missing or invalid app");
    assert(_.isString(state.filesVersion), "missing or invalid filesVersion");
    assert(_.isNumber(state.mtime), "missing or invalid mtime");

    return new SyncState(rootDir, {
      app: state.app,
      filesVersion: state.filesVersion,
      mtime: state.mtime,
    });
  }

  /**
   * Flushes any pending writes to the filesystem.
   */
  flush(): void {
    this.#save.flush();
  }

  /**
   * @returns The JSON representation of this instance.
   */
  toJSON() {
    return this._inner;
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
    remoteFileSyncEvents(localFilesVersion: $localFilesVersion, encoding: base64) {
      remoteFilesVersion
      changed {
        path
        mode
        content
        encoding
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
