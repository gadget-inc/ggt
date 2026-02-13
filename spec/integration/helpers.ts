import { execa, type ResultPromise } from "execa";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Check if the integration test token is available.
 * Used with `describe.skipIf(!hasIntegrationToken())` for graceful skipping.
 */
export const hasIntegrationToken = (): boolean => {
  return !!process.env["INTEGRATION_TEST_TOKEN"];
};

/** Absolute path to the workspace root (repo root). */
export const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");

/** Absolute path to the built CLI entry point. */
export const GGT_MAIN_JS = path.join(WORKSPACE_ROOT, "dist/main.js");

export type TestDirs = {
  root: string;
  config: string;
  cache: string;
  data: string;
  app: string;
};

/**
 * Creates an isolated set of directories for an integration test run.
 * Returns paths for config, cache, data, and app directories.
 */
export const createTestDirs = (name: string): TestDirs => {
  const root = path.join(WORKSPACE_ROOT, "tmp/integration", `${name}-${randomUUID().slice(0, 8)}`);
  const dirs: TestDirs = {
    root,
    config: path.join(root, "config"),
    cache: path.join(root, "cache"),
    data: path.join(root, "data"),
    app: path.join(root, "app"),
  };

  fs.mkdirSync(dirs.config, { recursive: true });
  fs.mkdirSync(dirs.cache, { recursive: true });
  fs.mkdirSync(dirs.data, { recursive: true });
  fs.mkdirSync(dirs.app, { recursive: true });

  return dirs;
};

/**
 * Removes the test directory tree.
 * Uses maxRetries to handle transient EBUSY/EPERM errors on Windows
 * when file handles haven't fully released after a subprocess exits.
 */
export const cleanupTestDirs = (dirs: TestDirs): void => {
  fs.rmSync(dirs.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
};

/** Environment variables set for all ggt subprocess spawns. */
const subprocessEnv = (dirs: TestDirs): Record<string, string> => {
  return {
    GGT_TOKEN: process.env["INTEGRATION_TEST_TOKEN"]!,
    GGT_ENV: "production",
    GGT_CONFIG_DIR: dirs.config,
    GGT_CACHE_DIR: dirs.cache,
    GGT_DATA_DIR: dirs.data,
    FORCE_COLOR: "0",
    NODE_ENV: "production",
  };
};

export type RunGgtOptions = {
  args: string[];
  dirs: TestDirs;
  cwd?: string;
  timeout?: number;
};

export type RunGgtResult = {
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
};

/**
 * Spawns `node dist/main.js` with the given args and waits for it to complete.
 * Uses isolated config/cache/data dirs and the integration test token.
 */
export const runGgt = async ({ args, dirs, cwd, timeout }: RunGgtOptions): Promise<RunGgtResult> => {
  const result = await execa("node", [GGT_MAIN_JS, ...args], {
    cwd: cwd ?? dirs.app,
    env: subprocessEnv(dirs),
    reject: false,
    timeout: timeout ?? 60_000,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
};

export type StartGgtResult = {
  process: ResultPromise;
  stdout: () => string;
  stderr: () => string;
  kill: () => Promise<void>;
};

/**
 * Spawns a long-running ggt process (e.g. `ggt dev`).
 * Returns handles for reading stdout/stderr and killing the process gracefully.
 */
export const startGgt = ({ args, dirs, cwd }: Omit<RunGgtOptions, "timeout">): StartGgtResult => {
  let stdoutBuf = "";
  let stderrBuf = "";

  const proc = execa("node", [GGT_MAIN_JS, ...args], {
    cwd: cwd ?? dirs.app,
    env: subprocessEnv(dirs),
    reject: false,
  });

  proc.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  return {
    process: proc,
    stdout: () => stdoutBuf,
    stderr: () => stderrBuf,
    kill: async () => {
      proc.kill("SIGINT");
      // Wait for graceful shutdown (up to 15s)
      try {
        await Promise.race([proc, new Promise((_, reject) => setTimeout(() => reject(new Error("kill timeout")), 15_000))]);
      } catch {
        // Force kill if graceful shutdown times out
        proc.kill("SIGKILL");
      }
    },
  };
};

/**
 * Polls for a file to exist at the given path.
 * Resolves when the file appears, rejects on timeout.
 */
export const waitForFile = async (
  filePath: string,
  { timeout = 30_000, interval = 500 }: { timeout?: number; interval?: number } = {},
): Promise<void> => {
  const { vi } = await import("vitest");
  await vi.waitFor(
    () => {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Timed out waiting for file: ${filePath} (after ${timeout}ms)`);
      }
    },
    { timeout, interval },
  );
};
