import fs from "fs-extra";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { describe, expect, it, onTestFailed, onTestFinished, vi } from "vitest";

import {
  KNOWN_REMOTE_FILE,
  TEST_APP,
  TEST_ENV,
  cleanupTestDirs,
  createTestDirs,
  hasIntegrationToken,
  runGgt,
  startGgt,
  waitForFile,
} from "./helpers.js";

describe.skipIf(!hasIntegrationToken())("integration", () => {
  it("whoami prints the logged-in user", async () => {
    const dirs = await createTestDirs("whoami");
    onTestFinished(() => cleanupTestDirs(dirs));

    const result = await runGgt({
      args: ["whoami"],
      dirs,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/You are logged in as .+/);
  });

  it("pull downloads files from gadget", async () => {
    const dirs = await createTestDirs("pull");
    onTestFinished(() => cleanupTestDirs(dirs));

    const result = await runGgt({
      args: ["pull", "--app", TEST_APP, "--env", TEST_ENV, "--force"],
      dirs,
      timeout: 120_000,
    });

    expect(result.exitCode, `ggt pull failed.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);

    // Verify a known remote file was pulled
    const remoteFile = path.join(dirs.app, KNOWN_REMOTE_FILE);
    expect(await fs.pathExists(remoteFile), `Expected ${remoteFile} to exist after pull`).toBe(true);

    // Verify sync.json was created
    const syncJson = path.join(dirs.app, ".gadget/sync.json");
    expect(await fs.pathExists(syncJson), `Expected ${syncJson} to exist after pull`).toBe(true);
  });

  it("dev syncs files bidirectionally with gadget", { timeout: 180_000 }, async () => {
    const dirs = await createTestDirs("dev");
    onTestFinished(() => cleanupTestDirs(dirs));

    // Start ggt dev
    const devProcess = startGgt({
      args: ["dev", "--app", TEST_APP, "--env", TEST_ENV],
      dirs,
    });
    onTestFinished(() => devProcess.kill());

    // Log dev process output on failure for debugging
    onTestFailed(() => {
      console.error("dev stdout:\n" + (devProcess.stdout() || "(empty)"));
      console.error("dev stderr:\n" + (devProcess.stderr() || "(empty)"));
    });

    // Wait for initial sync to complete by checking for a known remote file
    const remoteFile = path.join(dirs.app, KNOWN_REMOTE_FILE);
    await waitForFile(remoteFile, { timeout: 90_000 });

    // Write a test file that should sync to Gadget
    const testFileName = `integration-test-${randomUUID()}.txt`;
    const testFileContent = `Integration test content ${randomUUID()}`;
    const testFilePath = path.join(dirs.app, testFileName);
    await fs.writeFile(testFilePath, testFileContent);

    // Poll pull until the test file appears on Gadget (avoids fixed sleep).
    // Cleanup is deferred to onTestFinished so that EBUSY errors on Windows
    // don't cause vi.waitFor to retry (and eventually time out).
    const pullDirsToClean: TestDirs[] = [];
    onTestFinished(async () => {
      for (const d of pullDirsToClean) {
        await cleanupTestDirs(d).catch(() => undefined);
      }
    });

    await vi.waitFor(
      async () => {
        const pullDirs = await createTestDirs("dev-pull-verify");
        pullDirsToClean.push(pullDirs);

        const pullResult = await runGgt({
          args: ["pull", "--app", TEST_APP, "--env", TEST_ENV, "--force"],
          dirs: pullDirs,
          timeout: 30_000,
        });

        expect(pullResult.exitCode, `ggt pull failed.\nstdout: ${pullResult.stdout}\nstderr: ${pullResult.stderr}`).toBe(0);

        const pulledFile = path.join(pullDirs.app, testFileName);
        expect(await fs.pathExists(pulledFile), `Expected ${pulledFile} to exist after pull`).toBe(true);
        expect(await fs.readFile(pulledFile, "utf-8")).toBe(testFileContent);
      },
      { timeout: 60_000, interval: 3_000 },
    );

    // Clean up: delete the test file and give dev time to sync the deletion
    await fs.remove(testFilePath);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  });
});
