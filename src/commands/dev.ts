import dayjs from "dayjs";
import ms from "ms";
import path from "node:path";
import Watcher from "watcher";
import which from "which";
import type { ArgsDefinition } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";
import { Changes } from "../services/filesync/changes.js";
import { YarnNotFoundError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { FileSyncStrategy, MergeConflictPreferenceArg } from "../services/filesync/strategy.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { footer } from "../services/output/footer.js";
import { notify } from "../services/output/notify.js";
import { println } from "../services/output/print.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { select } from "../services/output/select.js";
import { spin } from "../services/output/spinner.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";
import { unreachable } from "../services/util/assert.js";
import { debounceAsync } from "../services/util/function.js";
import { isAbortError } from "../services/util/is.js";
import { delay } from "../services/util/promise.js";
import type { PullArgs } from "./pull.js";
import type { PushArgs } from "./push.js";

export type DevArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--prefer": MergeConflictPreferenceArg,
  "--file-push-delay": { type: Number, default: ms("100ms") },
  "--file-watch-debounce": { type: Number, default: ms("300ms") },
  "--file-watch-poll-interval": { type: Number, default: ms("3s") },
  "--file-watch-poll-timeout": { type: Number, default: ms("20s") },
  "--file-watch-rename-timeout": { type: Number, default: ms("1.25s") },
} satisfies ArgsDefinition;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Start developing your application by merging your local files
      with your environment's files, in real-time.

      File changes are calculated from the last time you ran
      "ggt dev", "ggt push", or "ggt pull" on your local filesystem.

      {bold USAGE}
        ggt dev [DIRECTORY]

      {bold EXAMPLES}
        $ ggt dev
        $ ggt dev ~/gadget/example
        $ ggt dev ~/gadget/example
        $ ggt dev ~/gadget/example --app=example
        $ ggt dev ~/gadget/example --app=example --env=development --prefer=local

      {bold ARGUMENTS}
        DIRECTORY    The directory to merge files to (default: ".")

      {bold FLAGS}
        -a, --app=<name>           The application to merge files to
        -e, --env=<name>           The environment to merge files to
            --prefer=<filesystem>  Prefer "local" or "gadget" conflicting changes

        Run "ggt dev --help" for more information.
    `;
  }

  return sprint`
    Start developing your application by merging your local files
    with your environment's files, in real-time.

    File changes are calculated from the last time you ran
    "ggt dev", "ggt push", or "ggt pull" on your local filesystem.

    If conflicting changes are detected, you will be prompted to
    choose which changes to keep before "ggt dev" resumes.

    While "ggt dev" is running, changes on your local filesystem are
    immediately reflected on your environment, while file changes on
    your environment are immediately reflected on your local filesystem.

    Ideal for:
      • Local development with editors like VSCode
      • Storing source code in a Git repository like GitHub

    "ggt dev" looks for a ".ignore" file to exclude files and directories
    from being merged. The format is identical to Git's.

    These files are always ignored:
      • .DS_Store
      • .gadget
      • .git
      • node_modules

    Note:
      • Only works with development environments
      • Only supports "yarn" v1 for installing dependencies
      • Avoid deleting or moving all your files while "ggt dev" is running

    {bold USAGE}

      ggt dev [DIRECTORY] [--app=<name>] [--env=<name>] [--prefer=<filesystem>]
                          [--allow-unknown-directory] [--allow-different-app]

    {bold EXAMPLES}

      $ ggt dev
      $ ggt dev ~/gadget/example
      $ ggt dev ~/gadget/example
      $ ggt dev ~/gadget/example --app=example
      $ ggt dev ~/gadget/example --app=example --env=development --prefer=local

    {bold ARGUMENTS}

      DIRECTORY
        The path to the directory to merge files to.
        The directory will be created if it does not exist.

        Defaults to the current working directory. (default: ".")

    {bold FLAGS}

      -a, --app, --application=<name>
        The application to merge files to.

        Defaults to the application within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -e, --env, --environment=<name>
        The development environment to merge files to.

        Defaults to the environment within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      --prefer=<filesystem>
        Which filesystem's changes to automatically keep when
        conflicting changes are detected.

        Must be one of "local" or "gadget".

        If not provided, "ggt dev" will pause when conflicting changes
        are detected and you will be prompted to choose which changes to
        keep before "ggt dev" resumes.

      --allow-unknown-directory
        Allows "ggt dev" to continue when the chosen directory, nor
        any parent directories, contain a ".gadget/sync.json" file
        within it.

        Defaults to false.

      --allow-different-app
        Allows "ggt dev" to continue with a different --app than the
        one found within the ".gadget/sync.json" file.

        Defaults to false.

    Run "ggt dev -h" for less information.
  `;
};

export const command: Command<DevArgs> = async (ctx) => {
  if (!which.sync("yarn", { nothrow: true })) {
    throw new YarnNotFoundError();
  }

  const directory = await loadSyncJsonDirectory(ctx.args._[0] || process.cwd());
  const syncJson = await SyncJson.loadOrInit(ctx, { directory });
  footer({ ensureEmptyLineAbove: true })(syncJson.sprint());

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);

  if (!hashes.inSync) {
    // our local files don't match our environment's files
    if (!syncJson.previousEnvironment || (hashes.localChangesToPush.size === 0 && hashes.onlyDotGadgetFilesChanged)) {
      // one of the following is true:
      //   - we're developing on this environment for the first time
      //   - we're developing on the same environment as last time
      //   - we're developing on a different environment, but only .gadget/ files have changed
      //  merge the changes (if any) and continue
      await filesync.sync(ctx, {
        hashes,
        printLocalChangesOptions: {
          limit: 5,
        },
        printGadgetChangesOptions: {
          limit: 5,
        },
      });
    } else {
      // we're switching environment's and files outside of .gadget/
      // have changed, so ask the user what to do
      await filesync.print(ctx, { hashes });
      const choices = Object.values(FileSyncStrategy);

      const strategy = await select({
        ensureEmptyLineAbove: true,
        choices: hashes.bothChanged ? choices : choices.filter((choice) => choice !== FileSyncStrategy.MERGE),
        formatChoice: (choice) => {
          switch (choice) {
            case FileSyncStrategy.CANCEL:
              return sprint`Cancel (Ctrl+C)`;
            case FileSyncStrategy.MERGE:
              return sprint`Merge local and environment's changes`;
            case FileSyncStrategy.PUSH:
              switch (true) {
                case hashes.bothChanged:
                  return sprint`Push local changes and {underline discard environment's} changes`;
                case hashes.localChanges.size > 0:
                  return sprint`Push local changes`;
                case hashes.gadgetChanges.size > 0:
                  return sprint`Discard environment's changes`;
                default:
                  return unreachable("no changes to push or discard");
              }
            case FileSyncStrategy.PULL:
              switch (true) {
                case hashes.bothChanged:
                  return sprint`Pull environment's changes and {underline discard local} changes`;
                case hashes.localChanges.size > 0:
                  return sprint`Discard local changes`;
                case hashes.gadgetChanges.size > 0:
                  return sprint`Pull environment's changes`;
                default:
                  return unreachable("no changes to pull or discard");
              }
          }
        },
      })`
        {bold What do you want to do?}
      `;

      switch (strategy) {
        case FileSyncStrategy.CANCEL:
          process.exit(0);
          break;
        case FileSyncStrategy.MERGE:
          await filesync.sync(ctx, { hashes });
          break;
        case FileSyncStrategy.PUSH:
          await filesync.push(ctx as unknown as Context<PushArgs>, { hashes, force: true });
          break;
        case FileSyncStrategy.PULL:
          await filesync.pull(ctx as unknown as Context<PullArgs>, { hashes, force: true });
          break;
      }
    }
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
  const mergeChangesWithGadget = debounceAsync(ctx.args["--file-push-delay"], async (): Promise<void> => {
    try {
      const lastGitBranch = syncJson.gitBranch;
      await syncJson.loadGitBranch();

      if (lastGitBranch !== syncJson.gitBranch) {
        println({ ensureEmptyLineAbove: true })`
          Your git branch changed.

          ${lastGitBranch} → ${syncJson.gitBranch}
        `;

        // we need all the changes to be sent in a single batch, so wait
        // a bit in case there are changes the watcher hasn't seen yet
        const spinner = spin({ ensureEmptyLineAbove: true })("Waiting for file changes to settle.");
        await delay("3s"); // this time was chosen arbitrarily
        spinner.succeed();
      }

      const changes = new Changes(localChangesBuffer.entries());
      localChangesBuffer.clear();

      await filesync.mergeChangesWithGadget(ctx, { changes });
    } catch (error) {
      ctx.log.error("error sending changes to gadget", { error });
      ctx.abort(error);
    }
  });

  ctx.log.debug("watching", { path: syncJson.directory.path });

  /**
   * Watches the local filesystem for changes.
   */
  const fileWatcher = new Watcher(
    syncJson.directory.path,
    {
      // don't emit an event for every watched file when we start watching
      ignoreInitial: true,
      // watch everything
      recursive: true,
      // don't emit changes to .gadget/ files because they're readonly (Gadget manages them)
      ignore: (path: string) => syncJson.directory.relative(path).startsWith(".gadget") || syncJson.directory.ignores(path),
      // emit rename/renameDir events
      renameDetection: true,
      // how long to wait for an add event to be followed by an unlink
      // event, and vice versa (i.e. a rename event)
      renameTimeout: ctx.args["--file-watch-rename-timeout"],
      // how long to wait before emitting a change event (helps avoid duplicate events)
      debounce: ctx.args["--file-watch-debounce"],
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

      mergeChangesWithGadget();
    },
  ).once("error", (error) => ctx.abort(error));

  ctx.onAbort(async (reason) => {
    ctx.log.info("stopping", { reason });

    filesyncSubscription.unsubscribe();
    fileWatcher.close();
    clearInterval(clearRecentWritesInterval);
    await mergeChangesWithGadget.flush();

    try {
      await filesync.idle();
    } catch (error) {
      ctx.log.error("error while waiting for idle", { error });
    }

    if (isAbortError(reason)) {
      return;
    }

    notify(ctx, { subtitle: "Uh oh!", message: "An error occurred while syncing files" });
    await reportErrorAndExit(ctx, reason);
  });

  footer({ ensureEmptyLineAbove: true })`
${syncJson.sprint({ indent: 4 })}

    Waiting for file changes${symbol.ellipsis} {gray Press Ctrl+C to stop}
  `;
};
