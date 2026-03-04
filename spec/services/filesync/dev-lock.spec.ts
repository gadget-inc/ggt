import fs from "fs-extra";
import { describe, expect, it } from "vitest";

import {
  DevAlreadyRunningError,
  acquireDevLock,
  devLockPath,
  getDevStatus,
  isProcessAlive,
  readDevLock,
  releaseDevLock,
} from "../../../src/services/filesync/dev-lock.js";
import { Directory } from "../../../src/services/filesync/directory.js";
import { testDirPath } from "../../__support__/paths.js";

describe("dev-lock", () => {
  const makeDir = async (): Promise<Directory> => {
    const dirPath = testDirPath("local");
    await fs.ensureDir(dirPath);
    return await Directory.init(dirPath);
  };

  describe("isProcessAlive", () => {
    it("returns true for the current process", () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it("returns false for a non-existent PID", () => {
      // use a very large PID that is extremely unlikely to exist
      expect(isProcessAlive(2147483647)).toBe(false);
    });
  });

  describe("acquireDevLock", () => {
    it("creates the lock file", async () => {
      const directory = await makeDir();
      await acquireDevLock(directory);

      const lock = await readDevLock(directory);
      expect(lock).toBeDefined();
      expect(lock!.pid).toBe(process.pid);
      expect(lock!.startedAt).toBeDefined();
    });

    it("creates .gadget/ directory if it doesn't exist", async () => {
      const directory = await makeDir();
      expect(await fs.pathExists(directory.absolute(".gadget"))).toBe(false);

      await acquireDevLock(directory);

      expect(await fs.pathExists(directory.absolute(".gadget"))).toBe(true);
      expect(await fs.pathExists(devLockPath(directory))).toBe(true);
    });

    it("throws DevAlreadyRunningError when lock is held by a live process", async () => {
      const directory = await makeDir();
      await acquireDevLock(directory);

      await expect(acquireDevLock(directory)).rejects.toThrow(DevAlreadyRunningError);
    });

    it("replaces a stale lock (dead PID)", async () => {
      const directory = await makeDir();
      await fs.ensureDir(directory.absolute(".gadget"));
      await fs.writeJSON(devLockPath(directory), {
        pid: 2147483647,
        startedAt: "2024-01-01T00:00:00.000Z",
      });

      await acquireDevLock(directory);

      const lock = await readDevLock(directory);
      expect(lock).toBeDefined();
      expect(lock!.pid).toBe(process.pid);
    });

    it("replaces a malformed lock file", async () => {
      const directory = await makeDir();
      await fs.ensureDir(directory.absolute(".gadget"));
      await fs.writeFile(devLockPath(directory), "not json");

      await acquireDevLock(directory);

      const lock = await readDevLock(directory);
      expect(lock).toBeDefined();
      expect(lock!.pid).toBe(process.pid);
    });
  });

  describe("releaseDevLock", () => {
    it("removes the lock file", async () => {
      const directory = await makeDir();
      await acquireDevLock(directory);
      expect(await fs.pathExists(devLockPath(directory))).toBe(true);

      await releaseDevLock(directory);
      expect(await fs.pathExists(devLockPath(directory))).toBe(false);
    });

    it("does not throw when no lock file exists", async () => {
      const directory = await makeDir();
      await expect(releaseDevLock(directory)).resolves.toBeUndefined();
    });
  });

  describe("readDevLock", () => {
    it("returns undefined when no lock file exists", async () => {
      const directory = await makeDir();
      expect(await readDevLock(directory)).toBeUndefined();
    });

    it("returns undefined for malformed lock file", async () => {
      const directory = await makeDir();
      await fs.ensureDir(directory.absolute(".gadget"));
      await fs.writeFile(devLockPath(directory), "not json");

      expect(await readDevLock(directory)).toBeUndefined();
    });

    it("returns the lock data when valid", async () => {
      const directory = await makeDir();
      await fs.ensureDir(directory.absolute(".gadget"));
      const data = { pid: 12345, startedAt: "2024-01-01T00:00:00.000Z" };
      await fs.writeJSON(devLockPath(directory), data);

      expect(await readDevLock(directory)).toEqual(data);
    });
  });

  describe("getDevStatus", () => {
    it("returns not running when no lock file exists", async () => {
      const directory = await makeDir();
      expect(await getDevStatus(directory)).toEqual({ running: false });
    });

    it("returns running with PID when lock held by live process", async () => {
      const directory = await makeDir();
      await acquireDevLock(directory);

      const status = await getDevStatus(directory);
      expect(status.running).toBe(true);
      if (status.running) {
        expect(status.pid).toBe(process.pid);
        expect(status.startedAt).toBeDefined();
      }
    });

    it("cleans up stale lock and returns not running", async () => {
      const directory = await makeDir();
      await fs.ensureDir(directory.absolute(".gadget"));
      await fs.writeJSON(devLockPath(directory), {
        pid: 2147483647,
        startedAt: "2024-01-01T00:00:00.000Z",
      });

      const status = await getDevStatus(directory);
      expect(status).toEqual({ running: false });
      expect(await fs.pathExists(devLockPath(directory))).toBe(false);
    });
  });

  describe("DevAlreadyRunningError", () => {
    it("renders correctly", () => {
      const error = new DevAlreadyRunningError({ pid: 12345, directory: "/Users/jane/my-app" });
      expect(error.sprint()).toMatchInlineSnapshot(`
        "Another "ggt dev" process is already running in this directory:

          /Users/jane/my-app

        The existing process has PID 12345.

        Stop the other process first, or use a different directory."
      `);
    });
  });
});
