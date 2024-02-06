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
import { FileSync } from "../services/filesync/filesync.js";
import { MergeConflictPreferenceArg } from "../services/filesync/strategy.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { notify } from "../services/output/notify.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { debounce } from "../services/util/function.js";
import { isAbortError } from "../services/util/is.js";

export type SyncArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--prefer": MergeConflictPreferenceArg,
  "--once": Boolean,
  "--file-push-delay": { type: Number, default: ms("100ms") },
  "--file-watch-debounce": { type: Number, default: ms("300ms") },
  "--file-watch-poll-interval": { type: Number, default: ms("3s") },
  "--file-watch-poll-timeout": { type: Number, default: ms("20s") },
  "--file-watch-rename-timeout": { type: Number, default: ms("1.25s") },
} satisfies ArgsDefinition;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Sync your local filesystem with your environment's filesystem,
      in real-time.

      Changes will be calculated from the last time you ran
      "ggt sync", "ggt push", or "ggt pull" on your local filesystem.

      https://docs.gadget.dev/guides/development-tools/cli#filesync

      {bold USAGE}
        ggt sync [DIRECTORY]

      {bold EXAMPLES}
        $ ggt sync
        $ ggt sync ~/gadget/example
        $ ggt sync ~/gadget/example --once
        $ ggt sync ~/gadget/example --once --app=example
        $ ggt sync ~/gadget/example --once --app=example --env=development --prefer=local

      {bold ARGUMENTS}
        DIRECTORY    The directory to sync files to (default: ".")

      {bold FLAGS}
        -a, --app=<name>           The application to sync files to
        -e, --env=<name>           The environment to sync files to
            --prefer=<filesystem>  Prefer "local" or "gadget" conflicting changes
            --once                 Sync once and exit

        Run "ggt sync --help" for more information.
    `;
  }

  return sprint`
    Sync your local filesystem with your environment's filesystem,
    in real-time.

    Changes will be calculated from the last time you ran
    "ggt sync", "ggt push", or "ggt pull" on your local filesystem.

    If your environment has also made changes since the last sync,
    they will be merged with your local changes.

    If conflicting changes are detected, you will be prompted to
    choose which changes to keep before sync resumes.

    While "ggt sync" is running, changes on your local filesystem are
    immediately reflected on your environment, while file changes on
    your environment are immediately reflected on your local filesystem.

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
      • Sync only works with development environments
      • Avoid deleting or moving all your files while sync is running
      • only supports "yarn" v1 for installing dependencies

    https://docs.gadget.dev/guides/development-tools/cli#filesync

    {bold USAGE}

      ggt sync [DIRECTORY] [--app=<name>] [--env=<name>] [--prefer=<filesystem>] [--once]
                           [--allow-unknown-directory] [--allow-different-app]

    {bold EXAMPLES}

      $ ggt sync
      $ ggt sync ~/gadget/example
      $ ggt sync ~/gadget/example --once
      $ ggt sync ~/gadget/example --once --app=example
      $ ggt sync ~/gadget/example --once --app=example --env=development --prefer=local

    {bold ARGUMENTS}

      DIRECTORY
        The path to the directory to sync files to.
        The directory will be created if it does not exist.

        Defaults to the current working directory. (default: ".")

    {bold FLAGS}

      -a, --app, --application=<name>
        The application to sync files to.

        Defaults to the application within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -e, --env, --environment=<name>
        The development environment to sync files to.

        Defaults to the environment within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      --prefer=<filesystem>
        Which filesystem's changes to automatically keep when
        conflicting changes are detected.

        Must be one of "local" or "gadget".

        If not provided, sync will pause when conflicting changes are
        detected and you will be prompted to choose which changes to
        keep before sync resumes.

      --once
        "ggt sync" will merge changes from your local filesystem
        with changes from your environment's filesystem,
        the same way it does when started normally, but will then
        exit instead of continuing to watch for changes.

        Defaults to false.

      --allow-unknown-directory
        Allows "ggt sync" to continue when the chosen directory, nor
        any parent directories, contain a ".gadget/sync.json" file
        within it.

        Defaults to false.

      --allow-different-app
        Allows "ggt sync" to continue with a different --app than the
        one found within the ".gadget/sync.json" file.

        Defaults to false.

    Run "ggt sync -h" for less information.
  `;
};

export const command: Command<SyncArgs> = async (ctx) => {
  if (!which.sync("yarn", { nothrow: true })) {
    throw new YarnNotFoundError();
  }

  const directory = await loadSyncJsonDirectory(ctx.args._[0]);
  const syncJson = await SyncJson.loadOrInit(ctx, { directory });
  const filesync = new FileSync(syncJson);
  await filesync.sync(ctx);

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
  const filesyncSubscription = filesync.subscribeToGadgetChanges(ctx, {
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
    filesync.mergeChangesWithGadget(ctx, { changes }).catch((error) => ctx.abort(error));
  });

  ctx.log.debug("watching", { path: syncJson.directory.path });

  /**
   * Watches the local filesystem for changes.
   */
  const fileWatcher = new Watcher(
    syncJson.directory.path,
    {
      // don't emit an event for every watched file on boot
      ignoreInitial: true,
      // don't emit changes to .gadget/ files because they're readonly (Gadget manages them)
      ignore: (path: string) => syncJson.directory.relative(path).startsWith(".gadget") || syncJson.directory.ignores(path),
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
      const normalizedPath = syncJson.directory.normalize(filepath, isDirectory);

      ctx.log.trace("file event", { event, isDirectory, path: normalizedPath });

      if (filepath === syncJson.directory.absolute(".ignore")) {
        syncJson.directory.loadIgnoreFile().catch((error) => ctx.abort(error));
      } else if (syncJson.directory.ignores(filepath)) {
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
          const oldNormalizedPath = syncJson.directory.normalize(absolutePath, isDirectory);
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

  ctx.log.println`
    ggt v${config.version}

    ${await syncJson.sprintState()}
    ------------------------
    Preview      https://${syncJson.app.slug}--${syncJson.env.name}.gadget.app
    Editor       https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}
    Playground   https://${syncJson.app.primaryDomain}/api/playground/graphql?environment=${syncJson.env.name}
    Docs         https://docs.gadget.dev/api/${syncJson.app.slug}

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
