import { ArgError } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { printChanges } from "../services/filesync/changes.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { sprint } from "../services/output/sprint.js";

export type StatusArgs = typeof args;

export const args = SyncJsonArgs;

export const usage: Usage = () => {
  return sprint`
    Print the status of your local filesystem compared
    to your environment's filesystem.

    Changes will be calculated from the last time you ran
    "ggt sync", "ggt push", or "ggt pull" in the chosen directory.

    {bold USAGE}

      ggt status

    {bold EXAMPLES}

      $ ggt status
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

  await syncJson.printState();

  const filesync = new FileSync(syncJson);
  const { inSync, localChanges, gadgetChanges } = await filesync.hashes(ctx);
  if (inSync) {
    ctx.log.printlns`Your filesystem is in sync.`;
    return;
  }

  if (localChanges.size > 0) {
    printChanges(ctx, {
      changes: localChanges,
      tense: "past",
      message: "The following files have been changed locally",
    });
  }

  if (gadgetChanges.size > 0) {
    printChanges(ctx, {
      changes: gadgetChanges,
      tense: "past",
      message: "The following files have been changed on your environment",
    });
  }
};
