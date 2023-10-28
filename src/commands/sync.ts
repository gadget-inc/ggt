import arg from "arg";
import dayjs from "dayjs";
import { execa } from "execa";
import fs from "fs-extra";
import ms from "ms";
import path from "node:path";
import pMap from "p-map";
import PQueue from "p-queue";
import type { SetRequired } from "type-fest";
import FSWatcher from "watcher";
import which from "which";
import { FileSyncEncoding, type FileSyncChangedEventInput, type FileSyncDeletedEventInput } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import { config } from "../services/config.js";
import { debounce, type DebouncedFunc } from "../services/debounce.js";
import { defaults } from "../services/defaults.js";
import { EditGraphQL, PUBLISH_FILE_SYNC_EVENTS_MUTATION, REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION } from "../services/edit-graphql.js";
import { YarnNotFoundError } from "../services/errors.js";
import { FileHashes, FileSync, remoteFileHashes } from "../services/filesync.js";
import { swallowEnoent } from "../services/fs.js";
import { createLogger } from "../services/log.js";
import { noop } from "../services/noop.js";
import { notify } from "../services/notify.js";
import { println, println2, sprint } from "../services/output.js";
import { PromiseSignal } from "../services/promise.js";
import { select } from "../services/prompt.js";
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
  PUSH = "Push local changes to Gadget",
  PULL = "Pull remote changes from Gadget",
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
  args!: SetRequired<arg.Result<typeof argSpec>, "--file-push-delay">;

  /**
   * The current status of the sync process.
   */
  status = SyncStatus.STARTING;

  /**
   * A list of filepaths that have changed because of a remote file-sync
   * event. This is used to avoid sending files that we recently
   * received from a remote file-sync event.
   */
  recentRemoteChanges = new Map<string, number>();

  /**
   * A FIFO async callback queue that ensures we process file-sync events in the order they occurred.
   */
  queue = new PQueue({ concurrency: 1 });

  /**
   * A GraphQL client connected to the app's /edit/api/graphql-ws endpoint
   */
  graphql!: EditGraphQL;

  /**
   * Watches the local filesystem for changes.
   */
  watcher!: FSWatcher;

  /**
   * Handles writing files to the local filesystem.
   */
  filesync!: FileSync;

  /**
   * A debounced function that enqueue's local file changes to be sent to Gadget.
   */
  publish!: DebouncedFunc<() => void>;

  /**
   * Gracefully stops the sync.
   */
  stop!: (error?: unknown) => Promise<void>;

  /**
   * A logger for the sync command.
   */
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
    this.args = defaults(arg(argSpec, { argv: rootArgs._ }), {
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
      dir: this.args._[0],
      app: this.args["--app"],
      force: this.args["--force"],
      extraIgnorePaths: [".gadget"],
    });

    this.graphql = new EditGraphQL(this.filesync.app);

    const fileHashes = await FileHashes.load(this.filesync, this.graphql);
    const [, localRemoteFileHashes] = await remoteFileHashes(this.graphql, this.filesync.filesVersion);

    let action: Action | undefined;
    if (!this.filesync.wasEmpty) {
      println2`{bold The following files have changed }`;

      action = await select({
        message: "How do you want to resolve this?",
        choices: [Action.CANCEL, Action.PUSH, Action.PULL],
      });
    }

    switch (action) {
      case Action.PUSH: {
        break;
      }
      case Action.PULL: {
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

    const recentRemoteChangesInterval = setInterval(() => {
      for (const [path, timestamp] of this.recentRemoteChanges) {
        if (dayjs().isAfter(timestamp + ms("5s"))) {
          // this change should have been seen by now, so remove it
          this.recentRemoteChanges.delete(path);
        }
      }
    }, ms("1s")).unref();

    this.stop = async (e?: unknown) => {
      if (this.status !== SyncStatus.RUNNING) {
        return;
      }

      this.status = SyncStatus.STOPPING;
      error = e;

      this.log.info("stopping", { error });

      try {
        clearInterval(recentRemoteChangesInterval);
        unsubscribe();
        this.watcher.removeAllListeners();
        this.publish.flush();
        await this.queue.onIdle();
      } finally {
        await Promise.allSettled([this.watcher.close(), this.graphql.dispose()]);

        this.status = SyncStatus.STOPPED;
        stopped.resolve();
        this.log.info("stopped");
      }
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        if (this.status !== SyncStatus.RUNNING) {
          return;
        }

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

    const unsubscribe = this.graphql.subscribe(
      {
        query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
        variables: () => ({ localFilesVersion: String(this.filesync.filesVersion) }),
      },
      {
        error: (error) => void this.stop(error),
        next: ({ remoteFileSyncEvents }) => {
          const remoteFilesVersion = remoteFileSyncEvents.remoteFilesVersion;

          // we always ignore .gadget/ files so that we don't publish them (they're managed by gadget), but we still want to receive them
          const filterIgnored = (event: { path: string }) => event.path.startsWith(".gadget/") || !this.filesync.ignores(event.path);
          const changed = remoteFileSyncEvents.changed.filter(filterIgnored);
          const deleted = remoteFileSyncEvents.deleted.filter(filterIgnored);

          this.log.info("received files", {
            remoteFilesVersion,
            changed: changed.map((x) => x.path),
            deleted: deleted.map((x) => x.path),
          });

          this._enqueue(async () => {
            // add all the non-ignored files and directories we're about
            // to touch to recentRemoteChanges so that we don't send
            // them back
            for (const file of [...changed, ...deleted].filter((file) => !this.filesync.ignores(file.path))) {
              this.recentRemoteChanges.set(file.path, Date.now());

              let dir = path.dirname(file.path);
              while (dir !== ".") {
                this.recentRemoteChanges.set(dir + "/", Date.now());
                dir = path.dirname(dir);
              }
            }

            if (changed.length > 0 || deleted.length > 0) {
              println`Received {gray ${dayjs().format("hh:mm:ss A")}}`;
              // printPaths(
              //   [],
              //   changed.map((x) => x.path),
              //   deleted.map((x) => x.path),
              // );
            }

            await this.filesync.write({
              filesVersion: remoteFilesVersion,
              write: changed,
              delete: deleted.map((x) => x.path),
            });

            if (changed.some((x) => x.path === "yarn.lock")) {
              await execa("yarn", ["install"], { cwd: this.filesync.dir }).catch(noop);
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

    this.publish = debounce(this.args["--file-push-delay"], () => {
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

        if (changed.length === 0 && deleted.length === 0) {
          return;
        }

        const { publishFileSyncEvents } = await this.graphql.query({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: { input: { expectedRemoteFilesVersion: String(this.filesync.filesVersion), changed, deleted } },
        });

        await this.filesync.write({
          filesVersion: publishFileSyncEvents.remoteFilesVersion,
          write: [],
          delete: [],
        });

        println`Sent {gray ${dayjs().format("hh:mm:ss A")}}`;
        // printPaths(
        //   [],
        //   changed.map((x) => x.path),
        //   deleted.map((x) => x.path),
        // );
      });
    });

    this.watcher = new FSWatcher(this.filesync.dir, {
      // don't emit an event for every watched file on boot
      ignoreInitial: true,
      ignore: (path: string) => this.filesync.ignores(path),
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

      this.log.debug("file event", {
        event,
        path: normalizedPath,
        isDirectory,
        recentRemoteChanges: Array.from(this.recentRemoteChanges.keys()),
      });

      if (filepath === this.filesync.absolute(".ignore")) {
        this.filesync.reloadIgnorePaths();
      } else if (this.filesync.ignores(filepath)) {
        return;
      }

      if (this.recentRemoteChanges.delete(normalizedPath)) {
        return;
      }

      switch (event) {
        case "add":
        case "addDir":
        case "change": {
          const stats = fs.statSync(filepath);
          localFilesBuffer.set(normalizedPath, { mode: stats.mode, isDirectory });
          break;
        }
        case "unlink":
        case "unlinkDir": {
          localFilesBuffer.set(normalizedPath, { isDeleted: true, isDirectory });
          break;
        }
        case "rename":
        case "renameDir": {
          const stats = fs.statSync(filepath);
          localFilesBuffer.set(normalizedPath, {
            oldPath: this.filesync.normalize(absolutePath, isDirectory),
            newPath: normalizedPath,
            isDirectory,
            mode: stats.mode,
          });
          break;
        }
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
