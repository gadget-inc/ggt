import arg from "arg";
import assert from "assert";
import { format as formatDate } from "date-fns";
import { execa } from "execa";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import inquirer from "inquirer";
import _ from "lodash";
import pMap from "p-map";
import PQueue from "p-queue";
import path from "path";
import FSWatcher from "watcher";
import which from "which";
import { FileSyncEncoding, type FileSyncChangedEventInput, type FileSyncDeletedEventInput } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import { Client } from "../services/client.js";
import { config } from "../services/config.js";
import { YarnNotFoundError } from "../services/errors.js";
import {
  FileSync,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILES_VERSION_QUERY,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
  printPaths,
} from "../services/filesync.js";
import { swallowEnoent } from "../services/fs-utils.js";
import { createLogger } from "../services/log.js";
import { notify } from "../services/notify.js";
import { println, sprint } from "../services/output.js";
import { PromiseSignal } from "../services/promise.js";
import { getUserOrLogin } from "../services/user.js";
import { type RootArgs } from "./root.js";

export const usage = sprint`
  Sync your Gadget application's source code to and from
  your local filesystem.

  {bold USAGE}
    $ ggt sync [DIRECTORY] [--app <name>]

  {bold ARGUMENTS}
    DIRECTORY  {dim [default: .] The directory to sync files to.

               If the directory doesn't exist, it will be created.}

  {bold FLAGS}
    -a, --app=<name>  {dim The Gadget application to sync files to.}

    --force           {dim Whether to sync even if we can't determine
                      the state of your local files relative to
                      your remote ones.}

  {bold DESCRIPTION}
    Sync provides the ability to sync your Gadget application's source
    code to and from your local filesystem.

    While ggt sync is running, local file changes are immediately
    reflected within Gadget, while files that are changed remotely are
    immediately saved to your local filesystem.

    Use cases for this include:
      • Developing locally with your own editor like VSCode
      • Storing your source code in a Git repository like GitHub

    Sync includes the concept of a {dim .ignore} file. This file may
    contain a list of files and directories that won't be received or
    sent to Gadget when syncing. The format of this file is identical
    to the one used by Git {dim (https://git-scm.com/docs/gitignore)}.

    The following files and directories are always ignored:
      • .DS_Store
      • .gadget
      • .git
      • node_modules

    Note:
      • If you have separate development and production environments,
        {dim ggt sync} will only sync with your development environment
      • Gadget applications only support installing dependencies
        with Yarn 1 {dim (https://classic.yarnpkg.com/lang/en/)}
      • Since file changes are immediately reflected in Gadget,
        avoid the following while {dim ggt sync} is running:
          • Deleting all your files
          • Moving all your files to a different directory

  {bold EXAMPLES}
    {dim $ ggt sync --app my-app ~/gadget/my-app}

    App         my-app
    Editor      https://my-app.gadget.app/edit
    Playground  https://my-app.gadget.app/api/graphql/playground
    Docs        https://docs.gadget.dev/api/my-app

    Endpoints
      • https://my-app.gadget.app
      • https://my-app--development.gadget.app

    Watching for file changes... {dim Press Ctrl+C to stop}

    Received {dim 12:00:00 PM}
    {green ←} routes/GET.js {dim (changed)}
    {green ←} user/signUp/signIn.js {dim (changed)}
    {dim 2 files in total. 2 changed, 0 deleted.}

    Sent {dim 12:00:03 PM}
    {green →} routes/GET.ts {dim (changed)}
    {dim 1 file in total. 1 changed, 0 deleted.}

    ^C Stopping... {dim (press Ctrl+C again to force)}
    Goodbye!
`;

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

const argSpec = {
  "-a": "--app",
  "--app": AppArg,
  "--force": Boolean,
  "--file-push-delay": Number,
  "--file-watch-debounce": Number,
  "--file-watch-poll-interval": Number,
  "--file-watch-poll-timeout": Number,
  "--file-watch-rename-timeout": Number,
};

export class Sync {
  args!: arg.Result<typeof argSpec>;

  /**
   * The current status of the sync process.
   */
  status = SyncStatus.STARTING;

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
   * Watches the local filesystem for changes.
   */
  watcher!: FSWatcher;

  /**
   * The state of the local filesystem.
   */
  filesync!: FileSync;

  /**
   * A debounced function that enqueue's local file changes to be sent to Gadget.
   */
  publish!: _.DebouncedFunc<() => void>;

  /**
   * Gracefully stops the sync.
   */
  stop!: (error?: unknown) => Promise<void>;

  log = createLogger("sync", () => {
    return {
      app: this.filesync.app.slug,
      filesVersion: String(this.filesync.filesVersion),
      mtime: this.filesync.mtime,
    };
  });

  /**
   * Initializes the sync process.
   * - Ensures the directory exists.
   * - Ensures the directory is empty or contains a `.gadget/sync.json` file.
   * - Ensures an app is selected and that it matches the app the directory was previously synced to.
   * - Ensures yarn v1 is installed.
   * - Prompts the user how to resolve conflicts if the local filesystem has changed since the last sync.
   */
  async init(rootArgs: RootArgs): Promise<void> {
    this.args = _.defaults(arg(argSpec, { argv: rootArgs._ }), {
      "--file-push-delay": 100,
      "--file-watch-debounce": 300,
      "--file-watch-poll-interval": 3_000,
      "--file-watch-poll-timeout": 20_000,
      "--file-watch-rename-timeout": 1_250,
    });

    if (!which.sync("yarn", { nothrow: true })) {
      throw new YarnNotFoundError();
    }

    const user = await getUserOrLogin();

    this.filesync = await FileSync.init(user, {
      dir: rootArgs._[0],
      app: this.args["--app"],
      force: this.args["--force"],
      extraIgnorePaths: [".gadget"],
    });

    this.client = new Client(this.filesync.app);

    const { remoteFilesVersion } = await this.client.queryUnwrap({ query: REMOTE_FILES_VERSION_QUERY });
    const hasRemoteChanges = BigInt(remoteFilesVersion) > this.filesync.filesVersion;

    const getChangedFiles = async (): Promise<Map<string, Stats>> => {
      const files = new Map();
      for await (const [absolutePath, stats] of this.filesync.walkDir()) {
        if (stats.mtime.getTime() > this.filesync.mtime) {
          files.set(this.filesync.normalize(absolutePath, stats.isDirectory()), stats);
        }
      }

      // never include the root directory
      files.delete("/");

      return files;
    };

    let changedFiles = await getChangedFiles();
    const hasLocalChanges = changedFiles.size > 0;
    if (hasLocalChanges) {
      this.log.info("local files have changed", {
        remoteFilesVersion,
        hasRemoteChanges,
        hasLocalChanges,
        changed: Array.from(changedFiles.keys()),
      });

      println("Local files have changed since you last synced");
      printPaths("-", Array.from(changedFiles.keys()), [], { limit: changedFiles.size });
      println();
    }

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
        this.log.info("merging local changes", {
          remoteFilesVersion,
          hasRemoteChanges,
          hasLocalChanges,
          changed: Array.from(changedFiles.keys()),
        });

        // We purposefully don't write the returned files version here
        // because we haven't received its associated files yet. This
        // will cause us to receive the remote files that have changed
        // since the last sync (+ the local files that we just
        // published)
        await this.client.queryUnwrap({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: {
            input: {
              expectedRemoteFilesVersion: remoteFilesVersion,
              changed: await pMap(changedFiles, async ([normalizedPath, stats]) => ({
                path: normalizedPath,
                mode: stats.mode,
                content: stats.isDirectory() ? "" : await fs.readFile(this.filesync.absolute(normalizedPath), "base64"),
                encoding: FileSyncEncoding.Base64,
              })),
              deleted: [],
            },
          },
        });
        break;
      }
      case Action.RESET: {
        this.log.info("resetting local changes", {
          remoteFilesVersion,
          hasRemoteChanges,
          hasLocalChanges,
          changed: Array.from(changedFiles.keys()),
        });

        // delete all the local files that have changed since the last
        // sync and set the files version to 0 so we receive all the
        // remote files again, including any files that we just deleted
        // that still exist
        await this.filesync.write(0n, [], changedFiles.keys(), true);
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }
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

      this.log.info("stopping", { error });

      try {
        unsubscribe();
        this.watcher.removeAllListeners();
        this.publish.flush();
        await this.queue.onIdle();
      } finally {
        await Promise.allSettled([this.watcher.close(), this.client.dispose()]);

        this.status = SyncStatus.STOPPED;
        stopped.resolve();
        this.log.info("stopped");
      }
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        if (this.status != SyncStatus.RUNNING) return;

        println` Stopping... {gray (press Ctrl+C again to force)}`;
        void this.stop();

        // When ggt is run via npx, and the user presses Ctrl+C, npx sends SIGINT twice in quick succession. In order to prevent the second
        // SIGINT from triggering the force exit listener, we wait a bit before registering it. This is a bit of a hack, but it works.
        setTimeout(() => {
          process.once(signal, () => {
            println(" Exiting immediately. Note that files may not have finished syncing.");
            process.exit(1);
          });
        }, 100).unref();
      });
    }

    const unsubscribe = this.client.subscribeUnwrap(
      {
        query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
        variables: () => ({ localFilesVersion: String(this.filesync.filesVersion) }),
      },
      {
        error: (error) => void this.stop(error),
        next: ({ remoteFileSyncEvents }) => {
          const remoteFilesVersion = remoteFileSyncEvents.remoteFilesVersion;

          // we always ignore .gadget/ files so that we don't publish them (they're managed by gadget), but we still want to receive them
          const filter = (event: { path: string }) => _.startsWith(event.path, ".gadget/") || !this.filesync.ignores(event.path);
          const changed = _.filter(remoteFileSyncEvents.changed, filter);
          const deleted = _.filter(remoteFileSyncEvents.deleted, filter);

          this.log.info("received files", {
            remoteFilesVersion,
            changed: _.map(changed, "path"),
            deleted: _.map(deleted, "path"),
          });

          this._enqueue(async () => {
            // add all the files and directories we're about to touch to
            // recentRemoteChanges so that we don't send them back
            for (const file of [...changed, ...deleted]) {
              this.recentRemoteChanges.add(file.path);
              for (const dir of _.split(path.dirname(file.path), "/")) {
                this.recentRemoteChanges.add(dir + "/");
              }
            }

            if (changed.length || deleted.length) {
              println`Received {gray ${formatDate(new Date(), "pp")}}`;
              printPaths("←", _.map(changed, "path"), _.map(deleted, "path"));
            }

            await this.filesync.write(remoteFilesVersion, changed, _.map(deleted, "path"));

            if (_.some(changed, ["path", "yarn.lock"])) {
              await execa("yarn", ["install"], { cwd: this.filesync.dir }).catch(_.noop);
            }
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
              content: file.isDirectory ? "" : await fs.readFile(this.filesync.absolute(normalizedPath), FileSyncEncoding.Base64),
              encoding: FileSyncEncoding.Base64,
            });
          } catch (error) {
            // A file could have been changed and then deleted before we process the change event, so the readFile
            // above will raise an ENOENT. This is normal operation, so just ignore this event.
            swallowEnoent(error);
          }
        });

        if (!changed.length && !deleted.length) {
          return;
        }

        const { publishFileSyncEvents } = await this.client.queryUnwrap({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: { input: { expectedRemoteFilesVersion: String(this.filesync.filesVersion), changed, deleted } },
        });

        await this.filesync.write(publishFileSyncEvents.remoteFilesVersion, [], []);

        println`Sent {gray ${formatDate(new Date(), "pp")}}`;
        printPaths("→", _.map(changed, "path"), _.map(deleted, "path"));
      });
    }, this.args["--file-push-delay"]);

    this.watcher = new FSWatcher(this.filesync.dir, {
      // paths that we never want to publish
      ignore: /(\.gadget|\.git|node_modules|\.DS_Store)/,
      // don't emit an event for every watched file on boot
      ignoreInitial: true,
      renameDetection: true,
      recursive: true,
      debounce: this.args["--file-watch-debounce"],
      pollingInterval: this.args["--file-watch-poll-interval"],
      pollingTimeout: this.args["--file-watch-poll-timeout"],
      renameTimeout: this.args["--file-watch-rename-timeout"],
    });

    this.watcher.once("error", (error) => void this.stop(error));

    this.watcher.on("all", (event: string, absolutePath: string, renamedPath: string) => {
      const filepath = event === "rename" || event === "renameDir" ? renamedPath : absolutePath;
      const isDirectory = event === "renameDir" || event === "addDir" || event === "unlinkDir";
      const normalizedPath = this.filesync.normalize(filepath, isDirectory);

      if (filepath == this.filesync.absolute(".ignore")) {
        this.filesync.reloadIgnorePaths();
      } else if (this.filesync.ignores(filepath)) {
        return;
      }

      let stats: Stats | undefined;
      try {
        stats = fs.statSync(filepath);
      } catch (error) {
        swallowEnoent(error);
      }

      if (this.recentRemoteChanges.delete(normalizedPath)) {
        return;
      }

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
            oldPath: this.filesync.normalize(absolutePath, isDirectory),
            newPath: normalizedPath,
            isDirectory: event === "renameDir",
            mode: stats.mode,
          });
          break;
      }

      this.publish();
    });

    this.status = SyncStatus.RUNNING;

    println();
    println`
      {bold ggt v${config.version}}

      App         ${this.filesync.app.slug}
      Editor      https://${this.filesync.app.slug}.gadget.app/edit
      Playground  https://${this.filesync.app.slug}.gadget.app/api/graphql/playground
      Docs        https://docs.gadget.dev/api/${this.filesync.app.slug}

      {underline Endpoints} ${
        this.filesync.app.hasSplitEnvironments
          ? `
        • https://${this.filesync.app.primaryDomain}
        • https://${this.filesync.app.slug}--development.gadget.app`
          : `
        • https://${this.filesync.app.primaryDomain}`
      }

      Watching for file changes... {gray Press Ctrl+C to stop}
    `;
    println();

    await stopped;

    if (error) {
      notify({ subtitle: "Uh oh!", message: "An error occurred while syncing files" });
      throw error as Error;
    } else {
      println("Goodbye!");
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

const sync = new Sync();
export const init = sync.init.bind(sync);
export const run = sync.run.bind(sync);
