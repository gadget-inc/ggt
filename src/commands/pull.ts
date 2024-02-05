import type { ArgsDefinition } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { sprint } from "../services/output/sprint.js";

export type PullArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--force": { type: Boolean, alias: "-f" },
} satisfies ArgsDefinition;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Pull changes from Gadget's filesystem to your local filesystem.

      {bold USAGE}
        ggt pull [DIRECTORY]

      {bold EXAMPLES}
        $ ggt pull
        $ ggt pull ~/gadget/example
        $ ggt pull ~/gadget/example --app=example
        $ ggt pull ~/gadget/example --app=example --env=development

      {bold ARGUMENTS}
        DIRECTORY          The directory to pull files to (default: ".")

      {bold FLAGS}
        -a, --app=<name>   The Gadget application to pull files from
        -e, --env=<name>   The Gadget environment to pull files from
            --force        Discard local changes

        Run "ggt pull --help" for more information.
    `;
  }

  return sprint`
    Pull changes from Gadget's filesystem to your local filesystem.

    The changes will be calculated from the last time you ran
    "ggt sync", "ggt push", or "ggt pull" in the chosen directory.

    If your local filesystem has also made changes since the last sync,
    you will be prompted to discard them or abort the pull.

    {bold USAGE}

      ggt pull [DIRECTORY] [--app=<name>] [--env=<name>] [--force]
                           [--allow-unknown-directory] [--allow-different-app]

    {bold EXAMPLES}

      $ ggt pull
      $ ggt pull ~/gadget/example
      $ ggt pull ~/gadget/example --app=example
      $ ggt pull ~/gadget/example --app=example --env=development
      $ ggt pull ~/gadget/example --app=example --env=development --allow-unknown-directory
      $ ggt pull ~/gadget/example --app=example --env=development --allow-unknown-directory --allow-different-app

    {bold ARGUMENTS}

      DIRECTORY
        The path to the directory to pull files to.

        Defaults to the current working directory. (default: ".")

    {bold FLAGS}

      -a, --app=<name>
        The Gadget application to pull files from.

        If not provided, the application will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found, you will be
        prompted to choose an application from your list of apps.

      -e, --env, --env=<name>
        The Gadget development environment to pull files from.

        If not provided, the environment will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found or invalid, you will
        be prompted to choose a development environment from your list
        of environments.

      --force
        Any changes you have made to your local filesystem since the
        last time you ran "ggt sync", "ggt push", or "ggt pull"
        will be discarded without confirmation.

      --allow-unknown-directory
        Allows pull to continue when the chosen directory already
        contains files and does not contain a valid ".gadget/sync.json"
        file within it, or any of its parent directories.

        Defaults to false.

      --allow-different-app
        Allows pull to continue when the chosen directory contains a
        valid ".gadget/sync.json" file, but the application within
        it does not match the application provided by the --app flag.

        Defaults to false.

    Run "ggt pull -h" for less information.
  `;
};

export const command: Command<PullArgs> = async (ctx) => {
  const directory = await loadSyncJsonDirectory(ctx.args._[0]);
  const syncJson = await SyncJson.loadOrInit(ctx, { directory });
  const filesync = new FileSync(syncJson);
  await filesync.pull(ctx);
};
