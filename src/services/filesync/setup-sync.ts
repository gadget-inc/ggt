import type { Command } from "../command/command.ts";
import type { Context } from "../command/context.ts";
import type { FlagsResult } from "../command/flag.ts";
import colors from "../output/colors.ts";
import { println } from "../output/print.ts";
import { symbol } from "../output/symbols.ts";
import { ts } from "../output/timestamp.ts";
import { UnknownDirectoryError } from "./error.ts";
import { FileSync } from "./filesync.ts";
import { SyncJson, type SyncJsonFlags, loadSyncJsonDirectory } from "./sync-json.ts";

export const setupCommandSync = async (
  ctx: Context,
  command: Command,
  flags: FlagsResult<typeof SyncJsonFlags>,
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
