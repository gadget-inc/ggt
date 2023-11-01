import arg from "arg";
import dayjs from "dayjs";
import { execa } from "execa";
import fs from "fs-extra";
import ms from "ms";
import path from "node:path";
import pMap from "p-map";
import PQueue from "p-queue";
import { getFileChanges, getHashes } from "src/services/filesync/hashes.js";
import Watcher from "watcher";
import which from "which";
import { FileSyncEncoding } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import { mapValues } from "../services/collections.js";
import { config } from "../services/config.js";
import { debounce } from "../services/debounce.js";
import { defaults } from "../services/defaults.js";
import { YarnNotFoundError } from "../services/errors.js";
import { printChanges } from "../services/filesync/changes.js";
import { getConflicts, printConflicts } from "../services/filesync/conflicts.js";
import { FileSync, type File } from "../services/filesync/filesync.js";
import { swallowEnoent } from "../services/fs.js";
import { createLogger } from "../services/log.js";
import { noop } from "../services/noop.js";
import { notify } from "../services/notify.js";
import { println, printlns, sprint } from "../services/print.js";
import { PromiseSignal } from "../services/promise.js";
import { getUserOrLogin } from "../services/user.js";
import type { Command } from "./index.js";

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

/**
 * Runs the sync process until it is stopped or an error occurs.
 */
export const command: Command = async (rootArgs) => {
  const args = defaults(arg(argSpec, { argv: rootArgs._ }), {
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

  const filesync = await FileSync.init(user, {
    dir: args._[0],
    app: args["--app"],
    force: args["--force"],
  });

  /**
   * A logger for the sync command.
   */
  const log = createLogger("sync", () => {
    return {
      app: filesync.app.slug,
      filesVersion: String(filesync.filesVersion),
      mtime: filesync.mtime,
    };
  });

  if (filesync.directory.wasEmpty) {
    // if the directory was empty, we don't need to check for changes
    return;
  }

  const { filesVersionHashes, localHashes, gadgetHashes } = await getHashes({ filesync });
  const localChanges = getFileChanges({ from: filesVersionHashes, to: localHashes });
  if (localChanges.length === 0) {
    // if there are no local changes, we don't need to check for conflicts
    return;
  }

  const gadgetChanges = getFileChanges({ from: filesVersionHashes, to: gadgetHashes });
  const conflicts = getConflicts({ localChanges, gadgetChanges });
  if (conflicts.length > 0) {
    printlns`{bold You have conflicting changes with Gadget}`;
    printConflicts(conflicts);

    printlns`
        {bold You must either}

          1. Push with --force and overwrite Gadget's conflicting changes

             {gray ggt push --force}

          2. Pull with --force and overwrite your conflicting changes

             {gray ggt pull --force}

          3. Discard your local changes

             {gray ggt reset}

          4. Manually resolve the conflicts and try again
      `;

    process.exit(1);
  }

  /**
   * A FIFO async callback queue that ensures we process filesync events
   * in the order we receive them.
   */
  const queue = new PQueue({ concurrency: 1 });

  /**
   * Enqueues a function that handles filesync events onto the {@linkcode queue}.
   *
   * @param fn The function to enqueue.
   */
  const enqueue = (fn: () => Promise<unknown>): void => {
    void queue.add(fn).catch(stop);
  };

  const stopReceivingChangesFromGadget = filesync.receiveChangesFromGadget({
    onError: (error) => void stop(error),
    onChange: ({ filesVersion, changed, deleted }) => {
      changed = changed.filter((file) => !filesync.directory.ignores(file.path));
      deleted = deleted.filter((filepath) => !filesync.directory.ignores(filepath));

      enqueue(async () => {
        // add all the files and directories we're about to touch to
        // recentWritesToLocalFilesystem so that we don't send them back
        // to Gadget
        for (const filepath of [...mapValues(changed, "path"), ...deleted]) {
          recentWritesToLocalFilesystem.set(filepath, Date.now());

          let dir = path.dirname(filepath);
          while (dir !== ".") {
            recentWritesToLocalFilesystem.set(dir + "/", Date.now());
            dir = path.dirname(dir);
          }
        }

        const changes = await filesync.writeToLocalFilesystem({ filesVersion, files: changed, delete: deleted });
        if (changes.length > 0) {
          println`Received {gray ${dayjs().format("hh:mm:ss A")}}`;
          printChanges({ changes });

          if (changed.some((change) => change.path === "yarn.lock")) {
            await execa("yarn", ["install"], { cwd: filesync.directory.path }).catch(noop);
          }
        }
      });
    },
  });

  /**
   * A debounced function that enqueue's local file changes to be sent to Gadget.
   */
  const publish = debounce(args["--file-push-delay"], () => {
    const localFiles = new Map(localFileEventsBuffer.entries());
    localFileEventsBuffer.clear();

    enqueue(async () => {
      const changed: File[] = [];
      const deleted: string[] = [];

      await pMap(localFiles, async ([normalizedPath, file]) => {
        if ("isDeleted" in file) {
          deleted.push(normalizedPath);
          return;
        }

        try {
          changed.push({
            path: normalizedPath,
            oldPath: "oldPath" in file ? file.oldPath : undefined,
            mode: file.mode,
            content: file.isDirectory ? "" : await fs.readFile(filesync.directory.absolute(normalizedPath), FileSyncEncoding.Base64),
            encoding: FileSyncEncoding.Base64,
          });
        } catch (error) {
          // a file could have been changed and then deleted before we
          // process the change event, so the readFile above will
          // raise an enoent. This is normal operation, so just ignore
          // this event.
          swallowEnoent(error);
        }
      });

      if (changed.length === 0 && deleted.length === 0) {
        return;
      }

      const changes = await filesync.sendToGadget({ changed, deleted });
      println`Sent {gray ${dayjs().format("hh:mm:ss A")}}`;
      printChanges({ changes, tense: "past" });
    });
  });

  const localFileEventsBuffer = new Map<
    string,
    | { mode: number; isDirectory: boolean }
    | { isDeleted: true; isDirectory: boolean }
    | { mode: number; oldPath: string; newPath: string; isDirectory: boolean }
  >();

  /**
   * Watches the local filesystem for changes.
   */
  const fileWatcher = new Watcher(filesync.directory.path, {
    ignoreInitial: true, // don't emit an event for every watched file on boot
    ignore: (path: string) => path.startsWith(".gadget/") || filesync.directory.ignores(path),
    renameDetection: true,
    recursive: true,
    debounce: args["--file-watch-debounce"],
    pollingInterval: args["--file-watch-poll-interval"],
    pollingTimeout: args["--file-watch-poll-timeout"],
    renameTimeout: args["--file-watch-rename-timeout"],
  });

  fileWatcher.once("error", (error) => void stop(error));

  fileWatcher.on("all", (event: string, absolutePath: string, renamedPath: string) => {
    const filepath = event === "rename" || event === "renameDir" ? renamedPath : absolutePath;
    const isDirectory = event === "renameDir" || event === "addDir" || event === "unlinkDir";
    const normalizedPath = filesync.directory.normalize(filepath, isDirectory);

    log.debug("file event", {
      event,
      path: normalizedPath,
      isDirectory,
      recentRemoteChanges: Array.from(recentWritesToLocalFilesystem.keys()),
    });

    if (filepath === filesync.directory.absolute(".ignore")) {
      filesync.directory.loadIgnoreFile();
    } else if (filesync.directory.ignores(filepath)) {
      return;
    }

    if (recentWritesToLocalFilesystem.delete(normalizedPath)) {
      return;
    }

    switch (event) {
      case "add":
      case "addDir":
      case "change": {
        const stats = fs.statSync(filepath);
        localFileEventsBuffer.set(normalizedPath, { mode: stats.mode, isDirectory });
        break;
      }
      case "unlink":
      case "unlinkDir": {
        localFileEventsBuffer.set(normalizedPath, { isDeleted: true, isDirectory });
        break;
      }
      case "rename":
      case "renameDir": {
        const stats = fs.statSync(filepath);
        localFileEventsBuffer.set(normalizedPath, {
          oldPath: filesync.directory.normalize(absolutePath, isDirectory),
          newPath: normalizedPath,
          isDirectory,
          mode: stats.mode,
        });
        break;
      }
    }

    publish();
  });

  /**
   * A list of filepaths that have changed because we (this ggt process)
   * modified them. This is used to avoid reacting to filesystem events
   * that we caused, which would cause an infinite loop.
   */
  const recentWritesToLocalFilesystem = new Map<string, number>();

  const clearRecentWritesInterval = setInterval(() => {
    for (const [path, timestamp] of recentWritesToLocalFilesystem) {
      if (dayjs().isAfter(timestamp + ms("5s"))) {
        // this change should have been seen by now
        recentWritesToLocalFilesystem.delete(path);
      }
    }
  }, ms("1s")).unref();

  let error: unknown;
  const stopped = new PromiseSignal();
  let stopping = false;

  /**
   * Gracefully stops the sync.
   */
  const stop = async (e?: unknown): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;
    error = e;

    log.info("stopping", { error });

    try {
      fileWatcher.close();
      clearInterval(clearRecentWritesInterval);
      publish.flush();
      stopReceivingChangesFromGadget();
      await queue.onIdle();
    } finally {
      stopped.resolve();
      log.info("stopped");
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) {
        return;
      }

      println` Stopping... {gray (press Ctrl+C again to force)}`;
      void stop();

      // when ggt is run via npx, and the user presses ctrl+c, npx
      // sends sigint twice in quick succession. in order to prevent
      // the second sigint from triggering the force exit listener, we
      // wait a bit before registering it
      setTimeout(() => {
        process.once(signal, () => {
          println(" Exiting immediately. Note that files may not have finished syncing.");
          process.exit(1);
        });
      }, ms("100ms")).unref();
    });
  }

  printlns`
      {bold ggt v${config.version}}

      App         ${filesync.app.slug}
      Editor      https://${filesync.app.slug}.gadget.app/edit
      Playground  https://${filesync.app.slug}.gadget.app/api/graphql/playground
      Docs        https://docs.gadget.dev/api/${filesync.app.slug}

      {underline Endpoints} ${
        filesync.app.hasSplitEnvironments
          ? `
        • https://${filesync.app.primaryDomain}
        • https://${filesync.app.slug}--development.gadget.app`
          : `
        • https://${filesync.app.primaryDomain}`
      }

      Watching for file changes... {gray Press Ctrl+C to stop}
    `;

  await stopped;

  if (error) {
    notify({ subtitle: "Uh oh!", message: "An error occurred while syncing files" });
    throw error as Error;
  } else {
    println("Goodbye!");
  }
};
