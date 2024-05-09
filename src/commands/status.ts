import { ArgError } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { getConflicts, printConflicts } from "../services/filesync/conflicts.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { sprint } from "../services/output/sprint.js";

export type StatusArgs = typeof args;

export const args = SyncJsonArgs;

export const usage: Usage = () => {
  return sprint`
    Shows file changes since last sync (e.g. $ggt dev, push, deploy etc.)

    {gray Usage}
          ggt status
  `;
};

export const command: Command<StatusArgs> = async (ctx) => {
  if (ctx.args._.length > 0) {
    throw new ArgError(sprint`
      "ggt status" does not take any positional arguments.

      If you are trying to see the status of a specific directory,
      you must "cd" to that directory and then run "ggt status".

      Run "ggt status -h" for more information.
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { directory });
  if (!syncJson) {
    throw new UnknownDirectoryError(ctx, { directory });
  }

  syncJson.print();

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);
  await filesync.print(ctx, { hashes });

  const conflicts = getConflicts({ localChanges: hashes.localChanges, environmentChanges: hashes.environmentChanges });
  if (conflicts.size > 0) {
    ctx.log.debug("conflicts detected", { conflicts });
    printConflicts({ conflicts });
  }
};
