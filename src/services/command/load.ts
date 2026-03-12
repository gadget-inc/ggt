import { UnknownDirectoryError } from "../filesync/error.js";
import { FileSync } from "../filesync/filesync.js";
import { SyncJson, type SyncJsonFlagsResult, loadSyncJsonDirectory } from "../filesync/sync-json.js";
import colors from "../output/colors.js";
import { println } from "../output/print.js";
import { symbol } from "../output/symbols.js";
import { ts } from "../output/timestamp.js";
import type { Command } from "./command.js";
import type { Context } from "./context.js";

/**
 * Load FileSync from the current working directory, syncing first if needed.
 * This is the setup pattern used by `ggt add` subcommands.
 */
export const loadFileSyncFromCwd = async (
  ctx: Context,
  { command, flags }: { command: Command; flags: SyncJsonFlagsResult },
): Promise<{ filesync: FileSync; syncJson: SyncJson }> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { command, flags, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError({ command, flags, directory });
  }

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx, { silent: true });

  if (!hashes.inSync) {
    await filesync.merge(ctx, {
      hashes,
      printEnvironmentChangesOptions: { limit: 5 },
      printLocalChangesOptions: { limit: 5 },
      silent: true,
    });
  }

  println({ ensureEmptyLineAbove: true, content: `${colors.created(symbol.tick)} Sync completed ${ts()}` });

  return { filesync, syncJson };
};
