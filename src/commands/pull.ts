import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println, sprint } from "../services/output/print.js";

export type PullArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--force": { type: Boolean, alias: "-f" },
} satisfies ArgsDefinition;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Pull changes from your environment's filesystem to your local filesystem.

      Changes are calculated from the last time you ran
      "ggt dev", "ggt push", or "ggt pull" on your local filesystem.

      {bold USAGE}
        ggt pull

      {bold EXAMPLES}
        $ ggt pull
        $ ggt pull --force
        $ ggt pull --force --env=staging
        $ ggt pull --force --env=staging --app=example --allow-unknown-directory

      {bold FLAGS}
        -a, --app=<name>   The application to pull files from
        -e, --env=<name>   The environment to pull files from
            --force        Discard un-synchronized local changes

        Run "ggt pull --help" for more information.
    `;
  }

  return sprint`
    Pull changes from your environment's filesystem to your local filesystem.

    Changes are calculated from the last time you ran
    "ggt dev", "ggt push", or "ggt pull" in the chosen directory.

    If your local filesystem has also made changes since the last sync,
    you will be prompted to discard them or abort the pull.

    {bold USAGE}

      ggt pull [DIRECTORY] [--app=<name>] [--env=<name>] [--force]
                           [--allow-unknown-directory] [--allow-different-app]

    {bold EXAMPLES}

      $ ggt pull
      $ ggt pull --force
      $ ggt pull --force --env=staging
      $ ggt pull --force --env=staging --app=example --allow-unknown-directory

    {bold FLAGS}

      -a, --app=<name>
        The application to pull files from.

        Defaults to the application within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -e, --env, --environment=<name>
        The environment to pull files from.

        Defaults to the environment within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -f, --force
        Discard any changes made to your local filesystem
        since the last "ggt dev", "ggt push", or "ggt pull".

        Defaults to false.

      --allow-unknown-directory
        Allows "ggt pull" to continue when the current directory, nor
        any parent directories, contain a ".gadget/sync.json" file
        within it.

        Defaults to false.

      --allow-different-app
        Allows "ggt pull" to continue with a different --app than the
        one found within the ".gadget/sync.json" file.

        Defaults to false.

    Run "ggt pull -h" for less information.
  `;
};

export const command: Command<PullArgs> = async (ctx) => {
  if (ctx.args._.length > 0) {
    throw new ArgError(sprint`
      "ggt pull" does not take any positional arguments.

      If you are trying to pull changes to a specific directory,
      you must "cd" to that directory and then run "ggt push".

       Run "ggt pull -h" for more information.
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { directory });
  if (!syncJson) {
    throw new UnknownDirectoryError(ctx, { directory });
  }

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);
  if (hashes.localChangesToPush.size === 0) {
    println({ ensureEmptyLineAbove: true })`
      Your files are up to date. {gray Nothing to pull.}
    `;
    return;
  }

  await filesync.pull(ctx, {
    hashes,
    printGadgetChangesOptions: {
      ensureEmptyLineAbove: true,
    },
  });
};
