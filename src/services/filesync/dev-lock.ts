import fs from "fs-extra";
import { z } from "zod";

import type { Directory } from "./directory.js";

import { GGTError, IsBug } from "../output/report.js";
import { sprint } from "../output/sprint.js";

/**
 * The data stored in the dev lock file.
 */
export const DevLockData = z.object({
  pid: z.number(),
  startedAt: z.string(),
});

export type DevLockData = z.infer<typeof DevLockData>;

/**
 * Error thrown when another `ggt dev` process is already running in the same directory.
 */
export class DevAlreadyRunningError extends GGTError {
  isBug = IsBug.NO;

  constructor(readonly details: { pid: number; directory: string }) {
    super(`Another ggt dev process is already running (PID ${details.pid})`);
  }

  protected render(): string {
    return sprint`
      Another "ggt dev" process is already running in this directory:

        ${this.details.directory}

      The existing process has PID ${String(this.details.pid)}.

      Stop the other process first, or use a different directory.
    `;
  }
}

/**
 * Returns the path to the dev lock file for the given directory.
 */
export const devLockPath = (directory: Directory): string => {
  return directory.absolute(".gadget/dev-lock.json");
};

/**
 * Checks whether a process with the given PID is alive.
 */
export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Reads and parses the dev lock file. Returns undefined if missing or malformed.
 */
export const readDevLock = async (directory: Directory): Promise<DevLockData | undefined> => {
  try {
    const data: unknown = await fs.readJSON(devLockPath(directory));
    const result = DevLockData.safeParse(data);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Atomically acquires the dev lock for the given directory.
 *
 * Uses `wx` flag for exclusive creation to prevent race conditions.
 * If a stale lock (dead PID) is found, it is removed and re-acquired.
 *
 * @throws {DevAlreadyRunningError} if another live process holds the lock.
 */
export const acquireDevLock = async (directory: Directory): Promise<void> => {
  const lockPath = devLockPath(directory);
  const lockData: DevLockData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  const content = JSON.stringify(lockData, null, 2);

  await fs.ensureDir(directory.absolute(".gadget"));

  try {
    await fs.writeFile(lockPath, content, { flag: "wx" });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }

    // Lock file already exists - check if the holding process is still alive
    const existing = await readDevLock(directory);
    if (existing && isProcessAlive(existing.pid)) {
      throw new DevAlreadyRunningError({ pid: existing.pid, directory: directory.path });
    }

    // Stale or malformed lock - remove and retry
    await fs.remove(lockPath);
    await fs.writeFile(lockPath, content, { flag: "wx" });
  }
};

/**
 * Releases the dev lock for the given directory. Ignores errors.
 */
export const releaseDevLock = async (directory: Directory): Promise<void> => {
  try {
    await fs.remove(devLockPath(directory));
  } catch {
    // ignore errors during cleanup
  }
};

/**
 * Returns the current dev status for the given directory.
 * Cleans up stale locks as a side effect.
 */
export const getDevStatus = async (
  directory: Directory,
): Promise<{ running: false } | { running: true; pid: number; startedAt: string }> => {
  const lock = await readDevLock(directory);
  if (!lock) {
    return { running: false };
  }

  if (!isProcessAlive(lock.pid)) {
    // Stale lock - clean it up
    await releaseDevLock(directory);
    return { running: false };
  }

  return { running: true, pid: lock.pid, startedAt: lock.startedAt };
};
