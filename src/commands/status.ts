import { ArgError } from "../services/command/arg.js";
import { defineCommand } from "../services/command/command.js";
import { getConflicts, printConflicts } from "../services/filesync/conflicts.js";
import { getDevStatus } from "../services/filesync/dev-lock.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import colors from "../services/output/colors.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export default defineCommand({
  name: "status",
  description: "Show sync state and pending file changes",
  details: sprint`
    Displays three things about your current sync directory:

      1. The app and environment you are syncing with.
      2. Whether "ggt dev" is currently running (and its PID if so).
      3. Any pending file changes on either side since the last sync.
  `,
  examples: ["ggt status", "ggt status --app myapp --env staging"],
  args: SyncJsonArgs,
  run: async (ctx, args) => {
    if (args._.length > 0) {
      throw new ArgError(
        sprint`
          "ggt status" does not take any positional arguments.

          If you are trying to see the status of a specific directory,
          you must "cd" to that directory and then run "ggt status".
        `,
      );
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
        content: sprint`${colors.success("ggt dev")} is running (PID ${String(devStatus.pid)}, started ${devStatus.startedAt})`,
      });
    } else {
      println({ ensureEmptyLineAbove: true, content: `${colors.hint("ggt dev")} is not running.` });
    }

    const filesync = new FileSync(syncJson);
    const hashes = await filesync.hashes(ctx);
    await filesync.print(ctx, { hashes });

    const conflicts = getConflicts({ localChanges: hashes.localChanges, environmentChanges: hashes.environmentChanges });
    if (conflicts.size > 0) {
      ctx.log.debug("conflicts detected", { conflicts });
      printConflicts({ conflicts });
    }
  },
});
