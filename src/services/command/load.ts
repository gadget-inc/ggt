import { UnknownDirectoryError } from "../filesync/error.js";
import { FileSync } from "../filesync/filesync.js";
import { SyncJson, SyncJsonFlags, type SyncJsonFlagsResult, loadSyncJsonDirectory } from "../filesync/sync-json.js";
import colors from "../output/colors.js";
import { println } from "../output/print.js";
import { symbol } from "../output/symbols.js";
import { ts } from "../output/timestamp.js";
import { AppIdentity, AppIdentityFlags, type AppIdentityFlagsResult } from "./app-identity.js";
import type { Command } from "./command.js";
import type { Context } from "./context.js";
import type { FlagsResult } from "./flag.js";

/**
 * Combined flags for commands that need app identity + sync.json access.
 */
export const LoadFlags = {
  ...AppIdentityFlags,
  ...SyncJsonFlags,
} as const;

export type LoadFlags = typeof LoadFlags;
export type LoadFlagsResult = FlagsResult<LoadFlags>;

/**
 * Load a SyncJson from the current working directory.
 * Throws UnknownDirectoryError if not found.
 */
export const loadSyncJsonFromCwd = async (
  ctx: Context,
  { command, flags }: { command: Command; flags: SyncJsonFlagsResult },
): Promise<SyncJson> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { command, flags, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError({ command, flags, directory });
  }
  return syncJson;
};

/**
 * Load a SyncJson from the current working directory, or initialize one.
 * Useful for commands like `dev` that can create a new sync.json.
 */
export const loadOrInitSyncJsonFromCwd = async (
  ctx: Context,
  { command, flags }: { command: Command; flags: SyncJsonFlagsResult },
): Promise<SyncJson> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  return SyncJson.loadOrAskAndInit(ctx, { command, flags, directory });
};

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

/**
 * Load AppIdentity from the current working directory.
 * Useful for commands that only need app/env info, not full sync state.
 */
export const loadAppIdentityFromCwd = async (
  ctx: Context,
  { command, flags }: { command: Command; flags: AppIdentityFlagsResult },
): Promise<AppIdentity> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  return AppIdentity.load(ctx, { command, flags, directory });
};
