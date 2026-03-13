import { defineCommand } from "../services/command/command.ts";
import { FlagError } from "../services/command/flag.ts";
import { getConflicts, printConflicts } from "../services/filesync/conflicts.ts";
import { getDevStatus } from "../services/filesync/dev-lock.ts";
import { UnknownDirectoryError } from "../services/filesync/error.ts";
import { FileSync } from "../services/filesync/filesync.ts";
import { SyncJson, SyncJsonFlags, loadSyncJsonDirectory } from "../services/filesync/sync-json.ts";
import colors from "../services/output/colors.ts";
import { println } from "../services/output/print.ts";
import { sprint } from "../services/output/sprint.ts";

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
  flags: SyncJsonFlags,
  run: async (ctx, flags) => {
    if (flags._.length > 0) {
      throw new FlagError(
        sprint`
          "ggt status" does not take any positional arguments.

          If you are trying to see the status of a specific directory,
          you must "cd" to that directory and then run "ggt status".
        `,
      );
    }

    const directory = await loadSyncJsonDirectory(process.cwd());
    const syncJson = await SyncJson.load(ctx, { command: "status", flags, directory });
    if (!syncJson) {
      throw new UnknownDirectoryError({ command: "status", flags, directory });
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
