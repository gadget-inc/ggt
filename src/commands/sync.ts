import dayjs from "dayjs";
import ms from "ms";
import path from "node:path";
import Watcher from "watcher";
import which from "which";
import type { ArgsDefinition } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { config } from "../services/config/config.js";
import { Changes } from "../services/filesync/changes.js";
import { YarnNotFoundError } from "../services/filesync/error.js";
import { FileSync, FileSyncArgs } from "../services/filesync/filesync.js";
import { notify } from "../services/output/notify.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { debounce } from "../services/util/function.js";
import { isAbortError } from "../services/util/is.js";

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Sync your local filesystem with your Gadget environment's
      filesystem in real-time.

      https://docs.gadget.dev/guides/development-tools/cli#filesync

      {bold USAGE}
        ggt sync [DIRECTORY]

      {bold EXAMPLES}
        $ ggt sync
        $ ggt sync ~/gadget/example
        $ ggt sync ~/gadget/example --app=example
        $ ggt sync ~/gadget/example --app=example --prefer=local --once

      {bold ARGUMENTS}
        DIRECTORY                  The directory to sync files to (default: ".")

      {bold FLAGS}
        -a, --app=<name>           The Gadget application to sync files to
            --prefer=<filesystem>  Prefer "local" or "gadget" conflicting changes
            --once                 Sync once and exit
            --force                Sync regardless of local filesystem state

        Run "ggt sync --help" for more information.
    `;
  }

  return sprint`
    Sync your local filesystem with your Gadget environment's
    filesystem in real-time.

    While ggt sync is running, local file changes are immediately
    reflected within Gadget, while files that are changed in Gadget are
    immediately saved to your local filesystem.

    Ideal for:
      • Local development with editors like VSCode
      • Storing source code in a Git repository like GitHub

    Sync looks for a ".ignore" file to exclude files and directories
    from being synced. The format is identical to Git's.

    These files are always ignored:
      • .DS_Store
      • .gadget
      • .git
      • node_modules

    Note:
      • Sync only works with your development environment
      • Avoid deleting or moving all your files while sync is running
      • Gadget only supports Yarn v1 for dependency installation

    https://docs.gadget.dev/guides/development-tools/cli#filesync

    {bold USAGE}

      ggt sync [DIRECTORY] [--app=<name>] [--prefer=<filesystem>] [--once] [--force]

    {bold EXAMPLES}

      $ ggt sync
      $ ggt sync ~/gadget/example
      $ ggt sync ~/gadget/example --app=example
      $ ggt sync ~/gadget/example --app=example --prefer=local --once
      $ ggt sync ~/gadget/example --app=example --prefer=local --once --force

    {bold ARGUMENTS}

      DIRECTORY
        The path to the directory to sync files to. The directory will
        be created if it does not exist.

        Defaults to the current working directory. (default: ".")

    {bold FLAGS}

      -a, --app=<name>
        The Gadget application to sync files to.

        If not provided, the application will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found, you will be
        prompted to choose an application from your list of apps.

      --prefer=<filesystem>
        Which filesystem's changes to automatically keep when
        conflicting changes are detected.

        If not provided, sync will pause when conflicting changes are
        detected and you will be prompted to choose which changes to
        keep before sync resumes.

        Must be one of "local" or "gadget".

      --once
        When provided, sync will merge the changes from Gadget with
        the changes from your local filesystem like it does when
        started normally, but will then exit instead of continuing to
        watch for changes.

        Defaults to false.

      --force
        When provided, sync will run regardless of the state of the
        local filesystem.

    Run "ggt sync -h" for less information.
  `;
};

export const args = {
  ...FileSyncArgs,
  "--once": Boolean,
  "--file-push-delay": { type: Number, default: ms("100ms") },
  "--file-watch-debounce": { type: Number, default: ms("300ms") },
  "--file-watch-poll-interval": { type: Number, default: ms("3s") },
  "--file-watch-poll-timeout": { type: Number, default: ms("20s") },
  "--file-watch-rename-timeout": { type: Number, default: ms("1.25s") },
} satisfies ArgsDefinition;

export type SyncArgs = typeof args;

/**
 * Runs the sync process until it is stopped or an error occurs.
 */
export const command: Command<SyncArgs> = async (ctx) => {
  if (!which.sync("yarn", { nothrow: true })) {
    throw new YarnNotFoundError();
  }

  const filesync = await FileSync.init(ctx);
  await filesync.sync();

  if (ctx.args["--once"]) {
    ctx.log.println("Done!");
    return;
  }

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

  /**
   * Subscribe to file changes on Gadget and apply them to the local
   * filesystem.
   */
  const filesyncSubscription = filesync.subscribeToGadgetChanges({
    onError: (error) => ctx.abort(error),
    beforeChanges: ({ changed, deleted }) => {
      // add all the files and directories we're about to touch to
      // recentWritesToLocalFilesystem so that we don't send them back
      // to Gadget
      for (const filepath of [...changed, ...deleted]) {
        recentWritesToLocalFilesystem.set(filepath, Date.now());

        let dir = path.dirname(filepath);
        while (dir !== ".") {
          recentWritesToLocalFilesystem.set(dir + "/", Date.now());
          dir = path.dirname(dir);
        }
      }
    },
  });

  /**
   * A buffer of local file changes to send to Gadget.
   */
  const localChangesBuffer = new Changes();

  /**
   * A debounced function that sends the local file changes to Gadget.
   */
  const sendChangesToGadget = debounce(ctx.args["--file-push-delay"], () => {
    const changes = new Changes(localChangesBuffer.entries());
    localChangesBuffer.clear();
    filesync.mergeChangesWithGadget({ changes }).catch((error) => ctx.abort(error));
  });

  ctx.log.debug("watching", { path: filesync.directory.path });

  /**
   * Watches the local filesystem for changes.
   */
  const fileWatcher = new Watcher(
    filesync.directory.path,
    {
      // don't emit an event for every watched file on boot
      ignoreInitial: true,
      // don't emit changes to .gadget/ files because they're readonly (Gadget manages them)
      ignore: (path: string) => filesync.directory.relative(path).startsWith(".gadget") || filesync.directory.ignores(path),
      renameDetection: true,
      recursive: true,
      debounce: ctx.args["--file-watch-debounce"],
      pollingInterval: ctx.args["--file-watch-poll-interval"],
      pollingTimeout: ctx.args["--file-watch-poll-timeout"],
      renameTimeout: ctx.args["--file-watch-rename-timeout"],
    },
    (event: string, absolutePath: string, renamedPath: string) => {
      const filepath = event === "rename" || event === "renameDir" ? renamedPath : absolutePath;
      const isDirectory = event === "renameDir" || event === "addDir" || event === "unlinkDir";
      const normalizedPath = filesync.directory.normalize(filepath, isDirectory);

      ctx.log.trace("file event", { event, isDirectory, path: normalizedPath });

      if (filepath === filesync.directory.absolute(".ignore")) {
        filesync.directory.loadIgnoreFile().catch((error) => ctx.abort(error));
      } else if (filesync.directory.ignores(filepath)) {
        return;
      }

      if (recentWritesToLocalFilesystem.delete(normalizedPath)) {
        ctx.log.trace("ignoring event because we caused it", { event, path: normalizedPath });
        return;
      }

      switch (event) {
        case "add":
        case "addDir":
          localChangesBuffer.set(normalizedPath, { type: "create" });
          break;
        case "rename":
        case "renameDir": {
          const oldNormalizedPath = filesync.directory.normalize(absolutePath, isDirectory);
          localChangesBuffer.set(normalizedPath, { type: "create", oldPath: oldNormalizedPath });
          break;
        }
        case "change": {
          localChangesBuffer.set(normalizedPath, { type: "update" });
          break;
        }
        case "unlink":
        case "unlinkDir": {
          localChangesBuffer.set(normalizedPath, { type: "delete" });
          break;
        }
      }

      sendChangesToGadget();
    },
  ).once("error", (error) => ctx.abort(error));

  const editorLink = `https://${filesync.app.slug}.gadget.app/edit${
    filesync.app.multiEnvironmentEnabled ? `/${filesync.ctx.environment}` : ""
  }`;
  const playgroundLink = `https://${filesync.app.slug}.gadget.app/api/graphql/playground`;

  const endpointsLink = filesync.app.multiEnvironmentEnabled
    ? `
      • https://${filesync.app.primaryDomain}
      • https://${filesync.app.slug}--${filesync.ctx.environment}.gadget.app
      `
    : filesync.app.hasSplitEnvironments
      ? `
      • https://${filesync.app.primaryDomain}
      • https://${filesync.app.slug}--development.gadget.app`
      : `
      • https://${filesync.app.primaryDomain}`;

  ctx.log.printlns`
    ggt v${config.version}

    App         ${filesync.app.slug}
    Editor      ${editorLink}
    Playground  ${playgroundLink}
    Docs        https://docs.gadget.dev/api/${filesync.app.slug}

    Endpoints ${endpointsLink}

    Watching for file changes... {gray Press Ctrl+C to stop}
  `;

  ctx.onAbort(async (reason) => {
    ctx.log.info("stopping", { reason });

    filesyncSubscription.unsubscribe();
    fileWatcher.close();
    clearInterval(clearRecentWritesInterval);
    sendChangesToGadget.flush();

    try {
      await filesync.idle();
    } catch (error) {
      ctx.log.error("error while waiting for idle", { error });
    }

    if (isAbortError(reason)) {
      ctx.log.printlns("Goodbye!");
      return;
    }

    notify(ctx, { subtitle: "Uh oh!", message: "An error occurred while syncing files" });
    await reportErrorAndExit(ctx, reason);
  });
};
