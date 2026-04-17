import { CREATE_ENVIRONMENT_MUTATION } from "../app/edit/operation.ts";
import { ClientError, formatClientErrorForUser } from "../app/error.ts";
import type { Context } from "../command/context.ts";
import { FlagError } from "../command/flag.ts";
import { FileSync } from "../filesync/filesync.ts";
import { loadSyncJsonDirectory, SyncJson } from "../filesync/sync-json.ts";
import type { SyncJson as SyncJsonType } from "../filesync/sync-json.ts";
import { println } from "../output/print.ts";

export type AddEnvironmentResult = {
  name: string;
};

/**
 * Generate a default environment name based on the current timestamp.
 */
export const generateDefaultEnvName = (): string => {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `env-${date}-${time}`;
};

/**
 * Create a new environment by cloning the current one.
 */
export const addEnvironment = async (
  ctx: Context,
  {
    syncJson,
    name,
  }: {
    syncJson: SyncJsonType;
    name: string;
  },
): Promise<AddEnvironmentResult> => {
  try {
    await syncJson.edit.mutate({
      mutation: CREATE_ENVIRONMENT_MUTATION,
      variables: { environment: { slug: name, sourceSlug: syncJson.environment.name } },
    });
  } catch (error) {
    if (error instanceof ClientError) {
      throw new FlagError(formatClientErrorForUser(error), { usageHint: false });
    }
    throw error;
  }

  return { name };
};

/**
 * Switch to a newly created environment by pulling from it.
 */
export const switchToNewEnvironment = async (
  ctx: Context,
  {
    envName,
    command,
  }: {
    envName: string;
    command: string;
  },
): Promise<void> => {
  const pullFromNewEnvSyncJson = await SyncJson.load(ctx, {
    command: command as "pull",
    flags: {
      _: [],
      "--application": undefined,
      "--allow-unknown-directory": undefined,
      "--allow-different-app": undefined,
      "--environment": envName,
    },
    directory: await loadSyncJsonDirectory(process.cwd()),
  });

  if (!pullFromNewEnvSyncJson) {
    return;
  }

  const filesync = new FileSync(pullFromNewEnvSyncJson);
  const hashes = await filesync.hashes(ctx);

  if (hashes.environmentChangesToPull.size === 0) {
    println({ ensureEmptyLineAbove: true, content: "Nothing to pull." });
    return;
  }

  if (hashes.localChangesToPush.size > 0) {
    await filesync.print(ctx, { hashes });
  }

  await filesync.pull(ctx, { hashes, force: true });
};
