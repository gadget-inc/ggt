import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanupTestDirs,
  createTestDirs,
  hasIntegrationToken,
  runGgt,
  startGgt,
  waitForFile,
  type StartGgtResult,
  type TestDirs,
} from "./helpers.js";

describe.skipIf(!hasIntegrationToken())("integration", () => {
  let dirs: TestDirs;
  let devProcess: StartGgtResult | undefined;

  afterEach(async () => {
    if (devProcess) {
      await devProcess.kill();
      devProcess = undefined;
    }
    if (dirs) {
      cleanupTestDirs(dirs);
    }
  });

  it("whoami prints the logged-in user", async () => {
    dirs = createTestDirs("whoami");

    const result = await runGgt({
      args: ["whoami"],
      dirs,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/You are logged in as .+/);
  });

  it("pull downloads files from gadget", async () => {
    dirs = createTestDirs("pull");

    const result = await runGgt({
      args: ["pull", "--app", "ggt-integration-tests", "--env", "development", "--force"],
      dirs,
      timeout: 120_000,
    });

    expect(result.exitCode, `ggt pull failed.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);

    // Verify a known remote file was pulled
    const remoteFile = path.join(dirs.app, "A_REMOTE_FILE_THAT_EXISTS.txt");
    expect(fs.existsSync(remoteFile), `Expected ${remoteFile} to exist after pull`).toBe(true);

    // Verify sync.json was created
    const syncJson = path.join(dirs.app, ".gadget/sync.json");
    expect(fs.existsSync(syncJson), `Expected ${syncJson} to exist after pull`).toBe(true);
  });

  it("dev syncs files bidirectionally with gadget", { timeout: 180_000 }, async () => {
    dirs = createTestDirs("dev");

    // Start ggt dev
    devProcess = startGgt({
      args: ["dev", "--app", "ggt-integration-tests", "--env", "development"],
      dirs,
    });

    // Wait for initial sync to complete by checking for a known remote file
    const remoteFile = path.join(dirs.app, "A_REMOTE_FILE_THAT_EXISTS.txt");
    try {
      await waitForFile(remoteFile, { timeout: 90_000 });
    } catch (error) {
      // Log dev process output for debugging
      const stdout = devProcess.stdout();
      const stderr = devProcess.stderr();
      throw new Error(
        `Initial sync timed out waiting for ${remoteFile}\n` +
          `dev stdout:\n${stdout || "(empty)"}\n` +
          `dev stderr:\n${stderr || "(empty)"}\n` +
          `original error: ${String(error)}`,
      );
    }

    // Write a test file that should sync to Gadget
    const testFileName = `integration-test-${randomUUID()}.txt`;
    const testFileContent = `Integration test content ${randomUUID()}`;
    const testFilePath = path.join(dirs.app, testFileName);
    fs.writeFileSync(testFilePath, testFileContent);

    // Poll pull until the test file appears on Gadget (avoids fixed sleep)
    await vi.waitFor(
      async () => {
        const pullDirs = createTestDirs("dev-pull-verify");
        try {
          const pullResult = await runGgt({
            args: ["pull", "--app", "ggt-integration-tests", "--env", "development", "--force"],
            dirs: pullDirs,
            timeout: 30_000,
          });

          expect(pullResult.exitCode, `ggt pull failed.\nstdout: ${pullResult.stdout}\nstderr: ${pullResult.stderr}`).toBe(0);

          const pulledFile = path.join(pullDirs.app, testFileName);
          expect(fs.existsSync(pulledFile), `Expected ${pulledFile} to exist after pull`).toBe(true);
          expect(fs.readFileSync(pulledFile, "utf-8")).toBe(testFileContent);
        } finally {
          cleanupTestDirs(pullDirs);
        }
      },
      { timeout: 60_000, interval: 3_000 },
    );

    // Clean up: delete the test file and give dev time to sync the deletion
    fs.unlinkSync(testFilePath);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  });
});
