import fs from "node:fs";
import path from "node:path";

import dayjs from "dayjs";
import ms from "ms";
import Watcher from "watcher";
import which from "which";

import type { EditSubscription } from "../services/app/edit/edit.js";
import type { ENVIRONMENT_LOGS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import { defineCommand } from "../services/command/command.js";
import { Changes } from "../services/filesync/changes.js";
import { acquireDevLock, releaseDevLock } from "../services/filesync/dev-lock.js";
import { YarnNotFoundError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { completePreference } from "../services/filesync/strategy.js";
import { FileSyncStrategy, MergeConflictPreferenceArg } from "../services/filesync/strategy.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { subscribeToEnvironmentLogs } from "../services/logs/subscribeToEnvironmentLogs.js";
import { maybePromptAgentsMd, maybePromptGadgetSkills } from "../services/output/agent-plugin.js";
import colors from "../services/output/colors.js";
import { footer } from "../services/output/footer.js";
import { LoggingArgs } from "../services/output/log/structured.js";
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

export default defineCommand({
  name: "dev",
  description: "Sync files and stream logs locally",
  details: sprint`
    Watches your local files and your Gadget environment for changes, syncing them
    bidirectionally in real time. This lets you develop with your preferred editor while
    keeping your environment up to date.

    On first run, or when files have diverged since the last sync, an initial reconciliation
    is performed. You must resolve any conflicts before continuous syncing begins.

    While running, application logs are streamed to the terminal unless --no-logs is passed.
  `,
  sections: [
    {
      title: "Ignoring files",
      content: sprint`
        Add a .ignore file (uses .gitignore syntax) to exclude files and folders from syncing.
        These paths are always excluded:

          • .DS_Store
          • .gadget
          • .git
          • .shopify
          • node_modules
      `,
    },
    {
      title: "Limitations",
      content: sprint`
          • Only syncs with development environments.
          • Only supports yarn v1 for installing dependencies.
          • Do not delete or move all files at once while syncing.
      `,
    },
  ],
  examples: [
    "ggt dev",
    "ggt dev ~/gadget/my-app",
    "ggt dev --prefer local",
    "ggt dev ~/gadget/my-app --app my-app --env development --prefer local",
  ],
  positionals: [
    {
      name: "directory",
      description: "Directory to sync files to",
      details: "If the directory does not exist, it will be created. Defaults to the current working directory when omitted.",
    },
  ],
  args: {
    ...SyncJsonArgs,
    ...LoggingArgs,
    "--prefer": {
      type: MergeConflictPreferenceArg,
      description: "Auto-resolve conflicts using the given source",
      details:
        "Use 'local' to keep your local file contents or 'environment' to keep the environment's version. Without this flag, you are prompted to choose for each conflict.",
      valueName: "source",
      complete: completePreference,
    },
    "--file-push-delay": {
      type: Number,
      default: ms("100ms"),
      description: "Delay in ms before pushing file changes",
      details:
        "Batches rapid file changes into a single push by waiting this long after the last change before sending. Increase if you see excessive network requests during bulk edits. Defaults to 100ms.",
      valueName: "ms",
      brief: false,
    },
    "--file-watch-debounce": {
      type: Number,
      default: ms("300ms"),
      description: "Debounce in ms for file watch events",
      details:
        "How long the file watcher waits after the last filesystem event before emitting a change. Helps avoid duplicate events from editors that write files in multiple steps. Defaults to 300ms.",
      valueName: "ms",
      brief: false,
    },
    "--file-watch-poll-interval": {
      type: Number,
      default: ms("3s"),
      description: "Interval in ms for polling file changes",
      details:
        "How often the file watcher polls for changes on filesystems that don't support native events (e.g. network drives). Defaults to 3s (3000ms).",
      valueName: "ms",
      brief: false,
    },
    "--file-watch-poll-timeout": {
      type: Number,
      default: ms("20s"),
      description: "Timeout in ms for file watch polling",
      details:
        "How long to wait for a poll cycle to complete before timing out. Increase for very large directories where polling is slow. Defaults to 20s (20000ms).",
      valueName: "ms",
      brief: false,
    },
    "--file-watch-rename-timeout": {
      type: Number,
      default: ms("1.25s"),
      description: "Timeout in ms for detecting file renames",
      details:
        "How long to wait for an add event to be followed by an unlink event (or vice versa) before treating them as separate operations instead of a rename. Defaults to 1.25s (1250ms).",
      valueName: "ms",
      brief: false,
    },
    "--no-logs": {
      type: Boolean,
      description: "Don't stream logs while syncing",
      details:
        "Useful when you only need file sync without log output, for example when running alongside a separate ggt logs session or in a background terminal.",
    },
  },
  run: async (ctx, args) => {
    if (!(await which("yarn", { nothrow: true }))) {
      throw new YarnNotFoundError();
    }

    const directory = await loadSyncJsonDirectory(args._[0] ?? process.cwd());
    const syncJson = await SyncJson.loadOrAskAndInit(ctx, { command: "dev", args, directory });
    await acquireDevLock(directory);
    ctx.onAbort(async () => {
      await releaseDevLock(directory);
    });
    await maybePromptAgentsMd({ ctx, directory: syncJson.directory });
    await maybePromptGadgetSkills({ ctx, directory: syncJson.directory });
    footer({ ensureEmptyLineAbove: true, content: syncJson.sprint() });

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
        await filesync.merge(ctx, {
          hashes,
          printLocalChangesOptions: {
            limit: 5,
          },
          printEnvironmentChangesOptions: {
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
          content: colors.header("What do you want to do?"),
          formatChoice: (choice) => {
            switch (choice) {
              case FileSyncStrategy.CANCEL:
                return sprint`Cancel (Ctrl+C)`;
              case FileSyncStrategy.MERGE:
                return sprint`Merge local and environment's changes`;
              case FileSyncStrategy.PUSH:
                switch (true) {
                  case hashes.bothChanged:
                    return sprint`Push local changes and ${colors.emphasis("discard environment's")} changes`;
                  case hashes.localChanges.size > 0:
                    return sprint`Push local changes`;
                  case hashes.environmentChanges.size > 0:
                    return sprint`Discard environment's changes`;
                  default:
                    return unreachable("no changes to push or discard");
                }
              case FileSyncStrategy.PULL:
                switch (true) {
                  case hashes.bothChanged:
                    return sprint`Pull environment's changes and ${colors.emphasis("discard local")} changes`;
                  case hashes.localChanges.size > 0:
                    return sprint`Discard local changes`;
                  case hashes.environmentChanges.size > 0:
                    return sprint`Pull environment's changes`;
                  default:
                    return unreachable("no changes to pull or discard");
                }
            }
          },
        });

        switch (strategy) {
          case FileSyncStrategy.CANCEL:
            process.exit(0);
            break;
          case FileSyncStrategy.MERGE:
            await filesync.merge(ctx, { hashes });
            break;
          case FileSyncStrategy.PUSH:
            await filesync.push(ctx, { command: "dev", hashes });
            break;
          case FileSyncStrategy.PULL:
            await filesync.pull(ctx, { hashes, force: true });
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
    const filesyncSubscription = filesync.subscribeToEnvironmentChanges(ctx, {
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

    let logsSubscription: EditSubscription<ENVIRONMENT_LOGS_SUBSCRIPTION> | undefined;

    if (!args["--no-logs"]) {
      logsSubscription = subscribeToEnvironmentLogs(syncJson.edit, args, {
        onError: (error) => {
          ctx.abort(error);
        },
      });
    }

    /**
     * A buffer of local file changes to send to Gadget.
     */
    const localChangesBuffer = new Changes();

    /**
     * A debounced function that sends the local file changes to Gadget.
     */
    const mergeChangesWithEnvironment = debounceAsync(args["--file-push-delay"], async (): Promise<void> => {
      try {
        const lastGitBranch = syncJson.gitBranch;
        await syncJson.loadGitBranch();

        if (lastGitBranch !== syncJson.gitBranch) {
          println({
            ensureEmptyLineAbove: true,
            content: sprint`
              Your git branch changed.

              ${lastGitBranch} → ${syncJson.gitBranch}
            `,
          });

          // we need all the changes to be sent in a single batch, so wait
          // a bit in case there are changes the watcher hasn't seen yet
          const spinner = spin({ ensureEmptyLineAbove: true, content: "Waiting for file changes to settle." });
          await delay("3s"); // this time was chosen arbitrarily
          spinner.succeed();
        }

        const changes = new Changes(localChangesBuffer.entries());
        localChangesBuffer.clear();

        await filesync.mergeChangesWithEnvironment(ctx, { changes });
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
        ignore: (filePath: string, isDirectory?: boolean) => {
          const relative = syncJson.directory.relative(filePath);
          if (relative.startsWith(".gadget")) return true;
          if (isDirectory === undefined) {
            try {
              isDirectory = fs.statSync(filePath).isDirectory();
            } catch {
              isDirectory = false;
            }
          }
          return syncJson.directory.ignores(filePath, isDirectory);
        },
        // emit rename/renameDir events
        renameDetection: true,
        // how long to wait for an add event to be followed by an unlink
        // event, and vice versa (i.e. a rename event)
        renameTimeout: args["--file-watch-rename-timeout"],
        // how long to wait before emitting a change event (helps avoid duplicate events)
        debounce: args["--file-watch-debounce"],
      },
      (event: string, absolutePath: string, renamedPath: string) => {
        const filepath = event === "rename" || event === "renameDir" ? renamedPath : absolutePath;
        const isDirectory = event === "renameDir" || event === "addDir" || event === "unlinkDir";
        const normalizedPath = syncJson.directory.normalize(filepath, isDirectory);

        ctx.log.trace("file event", { event, isDirectory, path: normalizedPath });

        if (recentWritesToLocalFilesystem.delete(normalizedPath)) {
          ctx.log.trace("ignoring event because we caused it", { event, path: normalizedPath });
          return;
        }

        if (filepath === syncJson.directory.absolute(".ignore")) {
          if (!syncJson.directory.ignoreFileLoadedWithin(ms("2s"))) {
            syncJson.directory.loadIgnoreFile().catch((error: unknown) => ctx.abort(error));
          }
        } else if (syncJson.directory.ignores(filepath, isDirectory)) {
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

        mergeChangesWithEnvironment();
      },
    ).once("error", (error) => ctx.abort(error));

    ctx.onAbort(async (reason) => {
      ctx.log.info("stopping", { reason });

      logsSubscription?.unsubscribe();
      filesyncSubscription.unsubscribe();
      fileWatcher.close();
      clearInterval(clearRecentWritesInterval);
      await mergeChangesWithEnvironment.flush();

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

    footer({
      ensureEmptyLineAbove: true,
      content: sprint`
        ${syncJson.sprint()}

        Waiting for file changes${symbol.ellipsis} ${colors.hint("Press Ctrl+C to stop")}
      `,
    });
  },
});
