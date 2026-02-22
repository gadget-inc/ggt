import type { Run } from "../services/command/command.js";

import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export const description = "Pull your environment's files to your local computer";

export const examples = ["ggt pull --env development --force"] as const;

export const longDescription = sprint`
  Pulls your environment files to your local directory.

  This command first tracks changes in your local directory since the last sync. If changes are
  detected, you will be prompted to discard them or abort the pull.
`;

export type PullArgs = typeof args;

export const args = {
  ...SyncJsonArgs,
  "--env": { type: String, alias: ["-e", "--environment", "--from"], description: "Select the environment" },
  "--force": { type: Boolean, alias: "-f", description: "Discard conflicting changes" },
} satisfies ArgsDefinition;

export const run: Run<PullArgs> = async (ctx, args) => {
  if (args._.length > 0) {
    throw new ArgError(sprint`
      "ggt pull" does not take any positional arguments.

      If you are trying to pull changes to a specific directory,
      you must "cd" to that directory and then run "ggt pull".

      Run "ggt pull -h" for more information.
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.loadOrAskAndInit(ctx, { command: "pull", args, directory });
  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);

  if (hashes.environmentChangesToPull.size === 0) {
    println({ ensureEmptyLineAbove: true, content: "Nothing to pull." });
    return;
  }

  if (hashes.localChangesToPush.size > 0) {
    // show them the local changes they will discard
    await filesync.print(ctx, { hashes });
  }

  await filesync.pull(ctx, { hashes, force: args["--force"] });
};
