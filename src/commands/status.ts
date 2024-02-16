import { ArgError } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { printChanges } from "../services/filesync/changes.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println, sprint, sprintln } from "../services/output/print.js";

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

  let output = sprintln(await syncJson.sprintState());
  output += sprintln("");

  const filesync = new FileSync(syncJson);
  const { localChanges, gadgetChanges } = await filesync.hashes(ctx);

  if (localChanges.size > 0) {
    output += sprintln(
      printChanges(ctx, {
        toStr: true,
        changes: localChanges,
        tense: "past",
        message: "Your local filesystem has changed.",
      }),
    );
  } else {
    output += sprintln`Your local filesystem has not changed.`;
  }

  output += sprintln("");

  if (gadgetChanges.size > 0) {
    output += sprintln(
      printChanges(ctx, {
        toStr: true,
        changes: gadgetChanges,
        includeDotGadget: true,
        tense: "past",
        message: "Your environment's filesystem has changed.",
      }),
    );
  } else {
    output += sprintln`Your environment's filesystem has not changed.`;
  }

  println(output);
};
