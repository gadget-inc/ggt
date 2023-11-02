import arg from "arg";
import dayjs from "dayjs";
import { execa } from "execa";
import ms from "ms";
import path from "node:path";
import PQueue from "p-queue";
import { getChanges, getChangesToMake, getNecessaryFileChanges } from "src/services/filesync/hashes.js";
import Watcher from "watcher";
import which from "which";
import { AppArg } from "../services/args.js";
import { mapValues } from "../services/collections.js";
import { config } from "../services/config.js";
import { debounce } from "../services/debounce.js";
import { defaults } from "../services/defaults.js";
import { YarnNotFoundError } from "../services/errors.js";
import { Changes, Create, Delete, Update, printChanges, printChangesToMake } from "../services/filesync/changes.js";
import { getConflicts, printConflicts } from "../services/filesync/conflicts.js";
import { FileSync } from "../services/filesync/filesync.js";
import { createLogger } from "../services/log.js";
import { noop } from "../services/noop.js";
import { notify } from "../services/notify.js";
import { println, printlns, sprint } from "../services/print.js";
import { PromiseSignal } from "../services/promise.js";
import { confirm, select } from "../services/prompt.js";
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

export enum Action {
  CANCEL = "Cancel (Ctrl+C)",
  MERGE = "Merge my changes with Gadget's changes",
  DISCARD_LOCAL = "Discard my changes",
  REPLACE_GADGET = "Discard Gadget's changes",
}

export enum Preference {
  LOCAL = "Keep my changes",
  GADGET = "Keep Gadget's changes",
}

/**
 * Runs the sync process until it is stopped or an error occurs.
 */
export const command: Command = async (rootArgs) => {
  if (!which.sync("yarn", { nothrow: true })) {
    throw new YarnNotFoundError();
  }

  const args = defaults(arg(argSpec, { argv: rootArgs._ }), {
    "--file-push-delay": 100,
    "--file-watch-debounce": 300,
    "--file-watch-poll-interval": 3_000,
    "--file-watch-poll-timeout": 20_000,
    "--file-watch-rename-timeout": 1_250,
  });

  const filesync = await FileSync.init({
    user: await getUserOrLogin(),
    dir: args._[0],
    app: args["--app"],
    force: args["--force"],
  });

  const log = createLogger("sync", () => ({
    app: filesync.app.slug,
    filesVersion: String(filesync.filesVersion),
    mtime: filesync.mtime,
  }));

  if (!filesync.directory.wasEmpty) {
    await catchUp(filesync);
  }

  /**
   * A FIFO async callback queue that ensures we process filesync events
   * in the order we receive them.
   */
  const queue = new PQueue({ concurrency: 1 });

  /**
   * Enqueues a function that handles filesync events onto the {@linkcode queue}.
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
        if (changes.size > 0) {
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
   * A buffer of local file changes to send to Gadget.
   */
  const localChangesBuffer = new Changes();

  /**
   * A debounced function that sends the local file changes to Gadget.
   */
  const sendChangesToGadget = debounce(args["--file-push-delay"], () => {
    const changes = new Changes(localChangesBuffer.entries());
    localChangesBuffer.clear();

    enqueue(async () => {
      await filesync.sendChangesToGadget({ changes: changes });
      println`Sent {gray ${dayjs().format("hh:mm:ss A")}}`;
      printChanges({ changes });
    });
  });

  /**
   * Watches the local filesystem for changes.
   */
  const fileWatcher = new Watcher(filesync.directory.path, {
    // don't emit an event for every watched file on boot
    ignoreInitial: true,
    // don't emit changes to .gadget/ files because they're readonly (Gadget manages them)
    ignore: (path: string) => filesync.directory.relative(path).startsWith(".gadget") || filesync.directory.ignores(path),
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
      isDirectory,
      path: normalizedPath,
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
        localChangesBuffer.set(normalizedPath, new Create());
        break;
      case "rename":
      case "renameDir": {
        const oldNormalizedPath = filesync.directory.normalize(absolutePath, isDirectory);
        localChangesBuffer.set(normalizedPath, new Create(oldNormalizedPath));
        break;
      }
      case "change": {
        localChangesBuffer.set(normalizedPath, new Update());
        break;
      }
      case "unlink":
      case "unlinkDir": {
        localChangesBuffer.set(normalizedPath, new Delete());
        break;
      }
    }

    sendChangesToGadget();
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
      sendChangesToGadget.flush();
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

/**
 * When this function returns, the state of the local filesystem matches
 * the state of Gadget
 */
export const catchUp = async (filesync: FileSync): Promise<void> => {
  const { filesVersionHashes, localHashes, gadgetHashes } = await filesync.getHashes();
  const localChanges = getChanges({ from: filesVersionHashes, to: localHashes, ignore: [".gadget/"] });
  const gadgetChanges = getChanges({ from: filesVersionHashes, to: gadgetHashes });
  const conflicts = getConflicts({ localChanges, gadgetChanges });

  if (conflicts.size > 0) {
    printlns`{bold You have conflicting changes with Gadget}`;
    printConflicts(conflicts);

    const action = await select({
      message: "How would you like to resolve these conflicts?",
      choices: Object.values(Action),
    });

    switch (action) {
      case Action.CANCEL: {
        process.exit(0);
        break;
      }
      case Action.MERGE: {
        const preference = await select({
          message: "Which conflicting changes would you like to keep?",
          choices: [Preference.LOCAL, Preference.GADGET],
        });

        if (preference === Preference.LOCAL) {
          const changes = getNecessaryFileChanges({ changes: localChanges, existing: gadgetHashes });
          printlns`{bold The following changes will be sent to Gadget}`;
          printChangesToMake({ changes });
          await confirm({ message: "Are you sure you want to send these changes?" });
          // send changes to gadget
          // receive new files version
          // re-run this function
        } else {
          const changes = getNecessaryFileChanges({ changes: gadgetChanges, existing: localHashes });
          printlns`{bold The following changes will be made to your local filesystem}`;
          printChangesToMake({ changes });
          await confirm({ message: "Are you sure you want to make these changes?" });
          // write changes to local filesystem
          // set files version to gadget's files version
          // re-run this function
        }
        break;
      }
      case Action.REPLACE_GADGET: {
        const changes = getChangesToMake({ from: localHashes, to: gadgetHashes, ignore: [".gadget/"] });
        printlns`{bold The following changes will be sent to Gadget}`;
        printChangesToMake({ changes });
        await confirm({ message: "Are you sure you want to send these changes?" });
        // send changes to gadget
        // receive new files version
        // re-run this function
        break;
      }
      case Action.DISCARD_LOCAL: {
        const changes = getChanges({ from: localHashes, to: filesVersionHashes });
        printlns`{bold The following changes will be made to your local filesystem}`;
        printChangesToMake({ changes });
        await confirm({ message: "Are you sure you want to make these changes?" });
        // reset local filesystem
        // re-run this function
        break;
      }
    }
  }

  // make the local filesystem match the current files version
};
