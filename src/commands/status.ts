import type { Run } from "../services/command/command.js";

import { ArgError, type ArgsDefinitionResult } from "../services/command/arg.js";
import { getConflicts, printConflicts } from "../services/filesync/conflicts.js";
import { getDevStatus } from "../services/filesync/dev-lock.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export const description = "Show your local and environment's file changes";

export const examples = ["ggt status"] as const;

export type StatusArgs = typeof args;
export type StatusArgsResult = ArgsDefinitionResult<StatusArgs>;

export const args = SyncJsonArgs;

export const run: Run<StatusArgs> = async (ctx, args) => {
  if (args._.length > 0) {
    throw new ArgError(sprint`
      "ggt status" does not take any positional arguments.

      If you are trying to see the status of a specific directory,
      you must "cd" to that directory and then run "ggt status".

      Run "ggt status -h" for more information.
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { command: "status", args, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError({ command: "status", args, directory });
  }

  syncJson.print();

  const devStatus = await getDevStatus(syncJson.directory);
  if (devStatus.running) {
    println({
      ensureEmptyLineAbove: true,
      content: sprint`{green ggt dev} is running (PID ${String(devStatus.pid)}, started ${devStatus.startedAt})`,
    });
  } else {
    println({ ensureEmptyLineAbove: true, content: sprint`{gray ggt dev} is not running.` });
  }

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);
  await filesync.print(ctx, { hashes });

  const conflicts = getConflicts({ localChanges: hashes.localChanges, environmentChanges: hashes.environmentChanges });
  if (conflicts.size > 0) {
    ctx.log.debug("conflicts detected", { conflicts });
    printConflicts({ conflicts });
  }
};
