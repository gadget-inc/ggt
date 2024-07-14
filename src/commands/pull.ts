import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export type PullArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--force": { type: Boolean, alias: "-f" },
} satisfies ArgsDefinition;

export const usage: Usage = (_ctx) => {
  return sprint`
  Pulls your environment files to your local directory.

  This command first tracks changes in your local directory since the last sync. If changes are
  detected, you will be prompted to discard them or abort the pull.

  {gray Usage}
        ggt pull [options]

  {gray Options}
        -a, --app <app_name>           Selects the app to pull your environment changes from. Default set on ".gadget/sync.json"
        --from, -e, --env <env_name>   Selects the environment to pull changes from. Default set on ".gadget/sync.json"
        --force                        Forces a pull by discarding any changes made on your local directory since last sync
        --allow-different-directory    Pulls changes from any environment directory, even if the ".gadget/sync.json" file is missing
        --allow-different-app          Pulls changes to a different app using --app command, instead of the one in the “.gadget/sync.json” file

  {gray Examples}
        Pull all development environment changes by discarding any changes made locally
        {cyanBright $ ggt pull --env development --force}
  `;
};

export const run: Run<PullArgs> = async (ctx) => {
  if (ctx.args._.length > 0) {
    throw new ArgError(sprint`
      "ggt pull" does not take any positional arguments.

      If you are trying to pull changes to a specific directory,
      you must "cd" to that directory and then run "ggt push".

       Run "ggt pull -h" for more information.
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.loadOrInit(ctx, { directory });
  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);

  if (hashes.environmentChangesToPull.size === 0) {
    println({ ensureEmptyLineAbove: true })`
      Nothing to pull.
    `;
    return;
  }

  if (hashes.localChangesToPush.size > 0) {
    // show them the local changes they will discard
    await filesync.print(ctx, { hashes });
  }

  await filesync.pull(ctx, { hashes });
};
