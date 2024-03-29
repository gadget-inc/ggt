import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export type PushArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--force": { type: Boolean, alias: "-f" },
} satisfies ArgsDefinition;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Push your local files to your environment's filesystem.
      Changes are tracked from the last "ggt dev", "ggt push", or
      "ggt pull" run locally.

      {bold USAGE}
        ggt push

      {bold EXAMPLES}
        $ ggt push
        $ ggt push --env=staging
        $ ggt push --env=staging --force

      {bold FLAGS}
        -a, --app=<name>   The application to push files to
        -e, --env=<name>   The environment to push files to
            --force        Discard changes to your environment's filesystem

        Run "ggt push --help" for more information.
    `;
  }

  return sprint`
    Push your local files to your environment's filesystem.
    Changes are tracked from the last "ggt dev", "ggt push", or
    "ggt pull" run locally.

    If your environment has un-pulled changes, and "--force" is not passed,
    you will be prompted to {underline discard them} or abort the push.

    {bold USAGE}

      ggt push [--app=<name>] [--env=<name>] [--force]
               [--allow-unknown-directory] [--allow-different-app]

    {bold EXAMPLES}

      $ ggt push
      $ ggt push --env=staging
      $ ggt push --env=staging --force
      $ ggt push --env=staging --force --allow-unknown-directory

    {bold FLAGS}

      -a, --app, --application=<name>
        The application to push files to.

        Defaults to the application within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -e, --env, --environment=<name>
        The environment to push files to.

        Defaults to the environment within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -f, --force
        Discard any changes made to your environment's filesystem
        since the last "ggt dev", "ggt push", or "ggt pull".

        Defaults to false.

      --allow-unknown-directory
        Allows "ggt push" to continue when the current directory, nor
        any parent directories, contain a ".gadget/sync.json" file
        within it.

        Defaults to false.

      --allow-different-app
        Allows "ggt push" to continue with a different "--app" than the
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
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.loadOrInit(ctx, { directory });
  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);

  if (hashes.localChangesToPush.size === 0) {
    println({ ensureEmptyLineAbove: true })`
      Nothing to push.
    `;
    return;
  }

  if (hashes.environmentChangesToPull.size > 0 && !hashes.onlyDotGadgetFilesChanged) {
    // show them the environment changes they will discard
    await filesync.print(ctx, { hashes });
  }

  await filesync.push(ctx, { hashes });
};
