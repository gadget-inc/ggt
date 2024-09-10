import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export type PushArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--force": { type: Boolean, alias: "-f" },
} satisfies ArgsDefinition;

export const usage: Usage = (_ctx) => {
  return sprint`
  Pushes your local files to your environment directory.

  This command first tracks changes in your environment directory since the last sync.
  If changes are detected, you will be prompted to discard them or abort the push.

  {gray Usage}
        ggt push [options]

  {gray Options}
        -a, --app <app_name>           Selects the app to push local changes to. Default set on ".gadget/sync.json"
        --from, -e, --env <env_name>   Selects the environment to push local changes to. Default set on ".gadget/sync.json"
        --force                        Forces a push by discarding any changes made on your environment directory since last sync
        --allow-different-directory    Pushes changes from any local directory with existing files, even if the ".gadget/sync.json" file is missing
        --allow-different-app          Pushes changes to an app using --app command, instead of the one in the “.gadget/sync.json” file

  {gray Examples}
        Push all local changes to the main environment by discarding any changes made on main
        {cyanBright $ ggt push --env main --force}
  `;
};

export const run: Run<typeof args> = async (ctx, args) => {
  if (args._.length > 0) {
    throw new ArgError(sprint`
      "ggt push" does not take any positional arguments.

      If you are trying to push changes from a specific directory,
      you must "cd" to that directory and then run "ggt push".
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.loadOrInit(ctx, { command: "push", args, directory });
  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);

  if (hashes.localChangesToPush.size === 0) {
    println({ ensureEmptyLineAbove: true, content: "Nothing to push." });
    return;
  }

  if (hashes.environmentChangesToPull.size > 0 && !hashes.onlyDotGadgetFilesChanged) {
    // show them the environment changes they will discard
    await filesync.print(ctx, { hashes });
  }

  await filesync.push(ctx, { command: "push", hashes });
};
