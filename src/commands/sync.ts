import arg from "arg";
import dayjs from "dayjs";
import { execa } from "execa";
import ms from "ms";
import path from "node:path";
import Watcher from "watcher";
import which from "which";
import { AppArg } from "../services/app/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { config } from "../services/config/config.js";
import { YarnNotFoundError } from "../services/error/error.js";
import { reportErrorAndExit } from "../services/error/report.js";
import { Changes } from "../services/filesync/changes.js";
import { FileSync } from "../services/filesync/filesync.js";
import { notify } from "../services/output/notify.js";
import { sprint } from "../services/output/sprint.js";
import { getUserOrLogin } from "../services/user/user.js";
import { debounce } from "../services/util/function.js";
import { isAbortError } from "../services/util/is.js";
import { defaults } from "../services/util/object.js";

export const usage: Usage = () => sprint`
  Sync your Gadget application's source code to and from
  your local filesystem.

  {bold USAGE}
    ggt sync [DIRECTORY]

  {bold ARGUMENTS}
    DIRECTORY         The directory to sync files to (default: ".")

  {bold FLAGS}
    -a, --app=<name>  The Gadget application to sync files to
        --force       Sync regardless of local file state

  {bold DESCRIPTION}
    Sync allows you to synchronize your Gadget application's source
    code with your local filesystem.

    While ggt sync is running, local file changes are immediately
    reflected within Gadget, while files that are changed in Gadget are
    immediately saved to your local filesystem.

    Ideal for:
      • Local development with editors like VSCode
      • Storing source code in a Git repository like GitHub

    Sync looks for a ".ignore" file to exclude certain files/directories
    from being synced. The format is identical to Git's.

    These files are always ignored:
      • .DS_Store
      • .gadget
      • .git
      • node_modules

    Note:
      • Sync only works with your development environment
      • Avoid deleting/moving all your files while sync is running
      • Gadget only supports Yarn v1 for dependency installation

  {bold EXAMPLE}
    $ ggt sync ~/gadget/example --app example

      App         example
      Editor      https://example.gadget.app/edit
      Playground  https://example.gadget.app/api/graphql/playground
      Docs        https://docs.gadget.dev/api/example

      Endpoints
        • https://example.gadget.app
        • https://example--development.gadget.app

      Watching for file changes... {gray Press Ctrl+C to stop}

      → Sent {gray 09:06:25 AM}
      {greenBright routes/GET-hello.js  + created}

      → Sent {gray 09:06:49 AM}
      {blueBright routes/GET-hello.js  ± updated}

      ← Received {gray 09:06:54 AM}
      {blueBright routes/GET-hello.js  ± updated}

      ← Received {gray 09:06:56 AM}
      {redBright routes/GET-hello.js  - deleted}
      ^C Stopping... {gray press Ctrl+C again to force}

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
export const command: Command = async (ctx) => {
  const args = defaults(arg(argSpec, { argv: ctx.rootArgs._ }), {
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

  await filesync.sync();

  const log = filesync.log.extend("sync");

  if (!which.sync("yarn", { nothrow: true })) {
    throw new YarnNotFoundError();
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
  const unsubscribeFromGadgetChanges = filesync.subscribeToGadgetChanges({
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
    afterChanges: async ({ changes }) => {
      if (changes.has("yarn.lock")) {
        await execa("yarn", ["install", "--check-files"], { cwd: filesync.directory.path }).catch((error) => {
          log.error("yarn install failed", { error });
        });
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
  const sendChangesToGadget = debounce(args["--file-push-delay"], () => {
    const changes = new Changes(localChangesBuffer.entries());
    localChangesBuffer.clear();
    filesync.sendChangesToGadget({ changes }).catch((error) => ctx.abort(error));
  });

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
      debounce: args["--file-watch-debounce"],
      pollingInterval: args["--file-watch-poll-interval"],
      pollingTimeout: args["--file-watch-poll-timeout"],
      renameTimeout: args["--file-watch-rename-timeout"],
    },
    (event: string, absolutePath: string, renamedPath: string) => {
      const filepath = event === "rename" || event === "renameDir" ? renamedPath : absolutePath;
      const isDirectory = event === "renameDir" || event === "addDir" || event === "unlinkDir";
      const normalizedPath = filesync.directory.normalize(filepath, isDirectory);

      log.trace("file event", { event, isDirectory, path: normalizedPath });

      if (filepath === filesync.directory.absolute(".ignore")) {
        filesync.directory.loadIgnoreFile().catch((error) => ctx.abort(error));
      } else if (filesync.directory.ignores(filepath)) {
        return;
      }

      if (recentWritesToLocalFilesystem.delete(normalizedPath)) {
        log.trace("ignoring event because we caused it", { event, path: normalizedPath });
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

  log.printlns`
    ggt v${config.version}

    App         ${filesync.app.slug}
    Editor      https://${filesync.app.slug}.gadget.app/edit
    Playground  https://${filesync.app.slug}.gadget.app/api/graphql/playground
    Docs        https://docs.gadget.dev/api/${filesync.app.slug}

    Endpoints ${
      filesync.app.hasSplitEnvironments
        ? `
      • https://${filesync.app.primaryDomain}
      • https://${filesync.app.slug}--development.gadget.app`
        : `
      • https://${filesync.app.primaryDomain}`
    }

    Watching for file changes... {gray Press Ctrl+C to stop}
  `;

  ctx.onAbort(async (reason) => {
    log.info("stopping", { reason });

    unsubscribeFromGadgetChanges();
    fileWatcher.close();
    clearInterval(clearRecentWritesInterval);
    sendChangesToGadget.flush();

    try {
      await filesync.idle();
    } catch (error) {
      log.error("error while waiting for idle", { error });
    }

    if (isAbortError(reason)) {
      log.printlns("Goodbye!");
      return;
    }

    notify({ subtitle: "Uh oh!", message: "An error occurred while syncing files" });
    await reportErrorAndExit(reason);
  });
};
