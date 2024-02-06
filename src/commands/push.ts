import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { sprint } from "../services/output/sprint.js";

export type PushArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--force": { type: Boolean, alias: "-f" },
} satisfies ArgsDefinition;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Push changes from your local filesystem to your
      Gadget environment's filesystem.

      The changes will be calculated from the last time you ran
      "ggt sync", "ggt push", or "ggt pull" on your local filesystem.

      {bold USAGE}
        ggt push

      {bold EXAMPLES}
        $ ggt push
        $ ggt push --force
        $ ggt push --force --env=staging
        $ ggt push --force --env=staging --allow-unknown-directory

      {bold FLAGS}
        -a, --app=<name>   The application to push files to
        -e, --env=<name>   The environment to push files to
            --force        Discard un-synchronized environment changes

        Run "ggt push --help" for more information.
    `;
  }

  return sprint`
    Push changes from your local filesystem to your
    Gadget environment's filesystem.

    The changes will be calculated from the last time you ran
    "ggt sync", "ggt push", or "ggt pull" on your local filesystem.

    If your Gadget environment has also made changes since the last
    sync, you will be prompted to discard them or abort the push.

    {bold USAGE}

      ggt push [--app=<name>] [--env=<name>] [--force]
               [--allow-unknown-directory] [--allow-different-app]

    {bold EXAMPLES}

      $ ggt push
      $ ggt push --force
      $ ggt push --force --env=staging
      $ ggt push --force --env=staging --allow-unknown-directory

    {bold FLAGS}

      -a, --app, --application=<name>
        The Gadget application to push files to.

        Defaults to the application within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -e, --env, --environment=<name>
        The Gadget development environment to push files to.

        Defaults to the environment within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -f, --force
        Changes to your Gadget environment's filesystem since the last
        "ggt sync", "ggt push", or "ggt pull" will be lost without warning.

        Defaults to false.

      --allow-unknown-directory
        Allows "ggt push" to continue when the current directory, nor
        any parent directories, contain a ".gadget/sync.json" file
        within it.

        Defaults to false.

      --allow-different-app
        Allows "ggt push" to continue with a different --app than the
        one found within the ".gadget/sync.json" file.

        Defaults to false.

    Run "ggt push -h" for less information.
  `;
};

export const command: Command<typeof args> = async (ctx) => {
  if (ctx.args._.length > 0) {
    throw new ArgError(sprint`
      "ggt push" does not take any positional arguments.

      If you are trying to push changes from a specific directory,
      you must "cd" to that directory and then run "ggt push".

       Run "ggt push -h" for more information.
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { directory });
  if (!syncJson) {
    throw new UnknownDirectoryError(ctx, { directory });
  }

  const filesync = new FileSync(syncJson);
  await filesync.push(ctx);
};
