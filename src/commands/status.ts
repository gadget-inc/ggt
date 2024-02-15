import { ArgError } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { sprintChanges } from "../services/filesync/changes.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { sprint } from "../services/output/sprint.js";

export type StatusArgs = typeof args;

export const args = SyncJsonArgs;

export const usage: Usage = () => {
  return sprint`
    Show changes made to your local filesystem and your
    environment's filesystem.

    Changes are calculated from the last time you ran
    "ggt dev", "ggt push", or "ggt pull".

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

  const buffer = ctx.log.buffer();

  buffer.println(await syncJson.sprintState());
  buffer.println();

  const filesync = new FileSync(syncJson);
  const { localChanges, gadgetChanges } = await filesync.hashes(ctx);

  if (localChanges.size > 0) {
    buffer.println(
      sprintChanges(ctx, {
        changes: localChanges,
        tense: "past",
        message: "Your local filesystem has changed.",
      }),
    );
  } else {
    buffer.println`Your local filesystem has not changed.`;
  }

  buffer.println();

  if (gadgetChanges.size > 0) {
    buffer.println(
      sprintChanges(ctx, {
        changes: gadgetChanges,
        includeDotGadget: true,
        tense: "past",
        message: "Your environment's filesystem has changed.",
      }),
    );
  } else {
    buffer.println`Your environment's filesystem has not changed.`;
  }

  buffer.flush();
};
