import { Args, Flags } from "@oclif/core";
import assert from "assert";
import chalkTemplate from "chalk-template";
import { FSWatcher } from "chokidar";
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
import { BaseCommand } from "../utils/base-command.js";
import type { Query } from "../utils/client.js";
import { Client } from "../utils/client.js";
import { context } from "../utils/context.js";
import { InvalidSyncAppFlagError, InvalidSyncFileError, YarnNotFoundError } from "../utils/errors.js";
import { app } from "../utils/flags.js";
import { FSIgnorer, ignoreEnoent, isEmptyDir, walkDir } from "../utils/fs-utils.js";
import { PromiseSignal } from "../utils/promise.js";

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
    "file-stability-threshold": Flags.integer({
      name: "file-stability-threshold",
      summary: "Time in milliseconds a file's size must remain the same.",
      helpGroup: "file",
      helpValue: "ms",
      default: 500,
      hidden: true,
    }),
    "file-poll-interval": Flags.integer({
      name: "file-poll-interval",
      description: "Interval in milliseconds between polling a file's size.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
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
        ...changed.map((normalizedPath) => chalkTemplate`{green ${prefix}} ${normalizedPath} {gray (changed)}`),
        ...deleted.map((normalizedPath) => chalkTemplate`{red ${prefix}} ${normalizedPath} {gray (deleted)}`),
      ],
      (line) => line.slice(line.indexOf(" ") + 1)
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
      chalkTemplate`{gray ${pluralize("file", lines.length, true)} in total. ${changed.length} changed, ${deleted.length} deleted.}`
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

    assert(_.isString(this.args["directory"]));

    this.dir =
      this.config.windows && this.args["directory"].startsWith("~/")
        ? path.join(this.config.home, this.args["directory"].slice(2))
        : path.resolve(this.args["directory"]);

    const getApp = async (): Promise<string> => {
      if (this.flags.app) return this.flags.app;
      if (this.state?.app) return this.state.app;
      const selected = await inquirer.prompt<{ app: string }>({
        type: "list",
        name: "app",
        message: "Please select the app to sync to.",
        choices: await context.getAvailableApps().then((apps) => apps.map((app) => app.slug)),
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

    this.watcher = new FSWatcher({
      ignored: (filepath) => this.ignorer.ignores(filepath),
      // don't emit an event for every watched file on boot
      ignoreInitial: true,
      // make sure stats are always present on add/change events
      alwaysStat: true,
      // wait for the entire file to be written before emitting add/change events
      awaitWriteFinish: { pollInterval: this.flags["file-poll-interval"], stabilityThreshold: this.flags["file-stability-threshold"] },
    });

    this.debug("starting");

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

    const changedFiles = await getChangedFiles();
    const hasLocalChanges = changedFiles.size > 0;
    if (hasLocalChanges) {
      this.log("Local files have changed since you last synced");
      this.logPaths("-", Array.from(changedFiles.keys()), [], { limit: changedFiles.size });
      this.log();
    }

    this.debug("init %O", { metadata: this.state, remoteFilesVersion, hasRemoteChanges, hasLocalChanges });

    let action: Action | undefined;
    if (hasLocalChanges) {
      ({ action } = await inquirer.prompt({
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

        // We purposefully don't set the returned remoteFilesVersion here because we haven't received the remote changes
        // yet. This will cause us to receive the local files that we just published + the remote files that were
        // changed since the last sync.
        await this.client.queryUnwrap({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: {
            input: {
              expectedRemoteFilesVersion: remoteFilesVersion,
              changed: await pMap(files, async ([normalizedPath, stats]) => {
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
        // delete all the local files that have changed since the last sync and set the files version to 0 so we receive
        // all the remote files again, including any files that we just deleted that still exist
        await pMap(changedFiles.keys(), (normalizedPath) => fs.remove(this.absolute(normalizedPath)));
        this.state.filesVersion = 0n;
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }

    this.debug("started");
  }

  /**
   * Runs the sync process until it is stopped or an error occurs.
   */
  async run(): Promise<void> {
    let error: unknown;
    const stopped = new PromiseSignal();

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
        this.state.flush();
        await Promise.allSettled([this.watcher.close(), this.client.dispose()]);

        this.debug("stopped");
        this.status = SyncStatus.STOPPED;
        stopped.resolve();
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
          const remoteFilesVersion = remoteFileSyncEvents.remoteFilesVersion;

          // we always ignore .gadget/ files so that we don't publish them (they're managed by gadget), but we still want to receive them
          const filter = (event: { path: string }) => event.path.startsWith(".gadget/") || !this.ignorer.ignores(event.path);
          const changed = remoteFileSyncEvents.changed.filter(filter);
          const deleted = remoteFileSyncEvents.deleted.filter(filter);

          this._enqueue(async () => {
            if (!changed.length && !deleted.length) {
              if (BigInt(remoteFilesVersion) > this.state.filesVersion) {
                // we still need to update filesVersion, otherwise our expectedFilesVersion will be behind the next time we publish
                this.debug("updated local files version from %s to %s", this.state.filesVersion, remoteFilesVersion);
                this.state.filesVersion = remoteFilesVersion;
              }
              return;
            }

            this.log(chalkTemplate`Received {gray ${format(new Date(), "pp")}}`);
            this.logPaths(
              "←",
              changed.map((x) => x.path),
              deleted.map((x) => x.path)
            );

            // we need to processed deleted files first as we may delete an empty directory after a file has been put
            // into it. if processed out of order the new file is deleted as well
            await pMap(deleted, async (file) => {
              this.recentRemoteChanges.add(file.path);
              await fs.remove(this.absolute(file.path));
            });

            await pMap(changed, async (file) => {
              this.recentRemoteChanges.add(file.path);

              const absolutePath = this.absolute(file.path);
              if (file.path.endsWith("/")) {
                await fs.ensureDir(absolutePath, { mode: 0o755 });
                return;
              }

              // we need to add the parent directory to recentRemoteChanges so that we don't try to publish it
              this.recentRemoteChanges.add(path.dirname(file.path) + "/");
              await fs.ensureDir(path.dirname(absolutePath), { mode: 0o755 });
              await fs.writeFile(absolutePath, Buffer.from(file.content, file.encoding), { mode: file.mode });

              if (absolutePath == this.absolute("yarn.lock")) {
                await execa("yarn", ["install"], { cwd: this.dir }).catch((err) => {
                  this.debug("yarn install failed");
                  this.debug(err.message);
                });
              }

              if (absolutePath == this.ignorer.filepath) {
                this.ignorer.reload();
              }
            });

            this.debug("updated local files version from %s to %s", this.state.filesVersion, remoteFilesVersion);
            this.state.filesVersion = remoteFilesVersion;

            // always remove the root directory from recentRemoteChanges
            this.recentRemoteChanges.delete("./");

            // remove any files in recentRemoteChanges that are ignored (e.g. .gadget/ files)
            for (const filepath of this.recentRemoteChanges) {
              if (this.ignorer.ignores(filepath)) {
                this.recentRemoteChanges.delete(filepath);
              }
            }
          });
        },
      }
    );

    const localFilesBuffer = new Map<string, { mode: number; isDirectory: boolean } | { isDeleted: true; isDirectory: boolean }>();

    this.publish = _.debounce(() => {
      const localFiles = new Map(localFilesBuffer.entries());
      localFilesBuffer.clear();

      this._enqueue(async () => {
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
              mode: file.mode,
              content: file.isDirectory ? "" : await fs.readFile(this.absolute(normalizedPath), "base64"),
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

        const data = await this.client.queryUnwrap({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: { input: { expectedRemoteFilesVersion: String(this.state.filesVersion), changed, deleted } },
        });

        this.log(chalkTemplate`Sent {gray ${format(new Date(), "pp")}}`);
        this.logPaths(
          "→",
          changed.map((x) => x.path),
          deleted.map((x) => x.path)
        );

        const { remoteFilesVersion } = data.publishFileSyncEvents;
        this.debug("remote files version after publishing %s", remoteFilesVersion);

        if (BigInt(remoteFilesVersion) > this.state.filesVersion) {
          this.debug("updated local files version from %s to %s", this.state.filesVersion, remoteFilesVersion);
          this.state.filesVersion = remoteFilesVersion;
        }
      });
    }, this.flags["file-push-delay"]);

    this.watcher
      .add(`${this.dir}/**/*`)
      .on("error", (error) => void this.stop(error))
      .on("all", (event, absolutePath, stats) => {
        const normalizedPath = this.normalize(absolutePath, event == "addDir" || event == "unlinkDir");

        if (stats?.isSymbolicLink?.()) {
          this.debug("skipping event caused by symlink %s", normalizedPath);
          return;
        }

        if (absolutePath == this.ignorer.filepath) {
          this.ignorer.reload();
        } else if (this.ignorer.ignores(absolutePath)) {
          this.debug("skipping event caused by ignored file %s", normalizedPath);
          return;
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

        this.debug("file changed %s", normalizedPath, event);

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
    `)
    );
    this.log();

    await stopped;

    if (error) {
      this.notify({ subtitle: "Uh oh!", message: "An error occurred while syncing files" });
      throw error;
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
  }, 100);

  private constructor(private _rootDir: string, inner: { app: string; filesVersion: string; mtime: number }) {
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
