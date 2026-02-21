import type { Run } from "../services/command/command.js";

import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { confirm } from "../services/output/confirm.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export const description = "Push your local files to your environment";

export const examples = ["ggt push --env main --force"] as const;

export const longDescription = [
  "Pushes your local files to your environment directory.",
  "",
  "This command first tracks changes in your environment directory since the last sync.",
  "If changes are detected, you will be prompted to discard them or abort the push.",
].join("\n");

export type PushArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--env": { type: String, alias: ["-e", "--environment", "--to"], description: "Select the environment" },
  "--force": { type: Boolean, alias: "-f", description: "Force the operation" },
} satisfies ArgsDefinition;

export const run: Run<typeof args> = async (ctx, args) => {
  if (args._.length > 0) {
    throw new ArgError(sprint`
      "ggt push" does not take any positional arguments.

      If you are trying to push changes from a specific directory,
      you must "cd" to that directory and then run "ggt push".

      Run "ggt push -h" for more information.
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.loadOrAskAndInit(ctx, { command: "push", args, directory });
  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);

  if (hashes.localChangesToPush.size === 0) {
    println({ ensureEmptyLineAbove: true, content: "Nothing to push." });
    return;
  }

  if (hashes.environmentChanges.size > 0 && !hashes.onlyDotGadgetFilesChanged) {
    // show them the environment changes they will discard
    await filesync.print(ctx, { hashes });

    if (!args["--force"]) {
      // they didn't pass --force, so we need to ask them if they want to discard the environment changes
      await confirm({
        ensureEmptyLineAbove: true,
        content: sprint`Are you sure you want to {underline discard} your environment's changes?`,
      });
    }
  }

  await filesync.push(ctx, { command: "push", hashes });
};
