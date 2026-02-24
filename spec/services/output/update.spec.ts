import fs from "fs-extra";
import ms from "ms";
import nock from "nock";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { config } from "../../../src/services/config/config.js";
import { Directory } from "../../../src/services/filesync/directory.js";
import { agentPluginShaPath } from "../../../src/services/output/agent-plugin.js";
import { getDistTags, shouldCheckForUpdate, warnIfUpdateAvailable } from "../../../src/services/output/update.js";
import { packageJson } from "../../../src/services/util/package-json.js";
import { testCtx } from "../../__support__/context.js";
import { expectStdout } from "../../__support__/output.js";
import { testDirPath } from "../../__support__/paths.js";

describe("getDistTags", () => {
  it("returns the dist tags", async () => {
    const distTags = {
      latest: "1.0.0",
      experimental: "0.0.0-experimental.41b05e2",
    };

    nock("https://registry.npmjs.org").get("/ggt").reply(200, {
      name: "ggt",
      "dist-tags": distTags,
    });

    await expect(getDistTags(testCtx)).resolves.toEqual(distTags);
  });

  it("throws if the response is invalid", async () => {
    nock("https://registry.npmjs.org")
      .get("/ggt")
      .reply(200, {
        name: "not-ggt",
        "dist-tags": {
          latest: "1.0.0",
          experimental: "0.0.0-experimental.41b05e2",
        },
      });

    await expect(getDistTags(testCtx)).rejects.toThrow();
  });
});

describe("shouldCheckForUpdate", () => {
  it("returns true if the last check was more than 12 hours ago", async () => {
    const lastCheck = Date.now() - ms("13 hours");

    await fs.outputFile(path.join(config.cacheDir, "last-update-check"), String(lastCheck));

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeTruthy();
  });

  it("returns false if the last check was less than 12 hours ago", async () => {
    const lastCheck = Date.now() - ms("11 hours");

    await fs.outputFile(path.join(config.cacheDir, "last-update-check"), String(lastCheck));

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeFalsy();
  });
});

describe("warnIfUpdateAvailable", () => {
  it("logs a warning if an update is available (latest)", async () => {
    packageJson.version = "1.0.0";

    nock("https://registry.npmjs.org")
      .get("/ggt")
      .reply(200, {
        name: "ggt",
        "dist-tags": {
          latest: "1.0.1",
          experimental: "0.0.0-experimental.41b05e2",
        },
      });

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeTruthy();

    await warnIfUpdateAvailable(testCtx);

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeFalsy();

    expectStdout().toMatchInlineSnapshot(`
      "╭──────────────────────────────────────────────────────────────────────╮
      │                                                                      │
      │                   Update available! 1.0.0 → 1.0.1                    │
      │   Changelog: https://github.com/gadget-inc/ggt/releases/tag/v1.0.1   │
      │                 Run "npm install -g ggt" to update.                  │
      │                                                                      │
      ╰──────────────────────────────────────────────────────────────────────╯
      "
    `);
  });

  it("logs a warning if an update is available (experimental)", async () => {
    packageJson.version = "0.0.0-experimental.bf3e4a3";

    nock("https://registry.npmjs.org")
      .get("/ggt")
      .reply(200, {
        name: "ggt",
        "dist-tags": {
          latest: "1.0.1",
          experimental: "0.0.0-experimental.41b05e2",
        },
      });

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeTruthy();

    await warnIfUpdateAvailable(testCtx);

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeFalsy();

    expectStdout().toMatchInlineSnapshot(`
      "╭──────────────────────────────────────────────────────────────────────────────╮
      │                                                                              │
      │                Update available! 0.0.0-experimental.bf3e4a3 →                │
      │                          0.0.0-experimental.41b05e2                          │
      │               Run "npm install -g ggt@experimental" to update.               │
      │                                                                              │
      ╰──────────────────────────────────────────────────────────────────────────────╯
      "
    `);
  });

  it("does nothing if already at latest version", async () => {
    packageJson.version = "1.0.0";

    nock("https://registry.npmjs.org")
      .get("/ggt")
      .reply(200, {
        name: "ggt",
        "dist-tags": {
          latest: "1.0.0",
          experimental: "0.0.0-experimental.41b05e2",
        },
      });

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeTruthy();

    await warnIfUpdateAvailable(testCtx);

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeFalsy();

    expectStdout().toBe("");
  });

  describe("agent plugin update check", () => {
    let originalCwd: string;

    const makeProjectDir = async (name: string): Promise<Directory> => {
      const dir = testDirPath(name);
      await fs.ensureDir(dir);
      return Directory.init(dir);
    };

    const mockGgtUpToDate = (): void => {
      nock("https://registry.npmjs.org")
        .get("/ggt")
        .reply(200, {
          name: "ggt",
          "dist-tags": {
            latest: packageJson.version,
            experimental: "0.0.0-experimental.41b05e2",
          },
        });
    };

    beforeEach(() => {
      originalCwd = process.cwd();
    });

    afterEach(() => {
      process.chdir(originalCwd);
      nock.cleanAll();
    });

    it("skips agent plugin check when not in a gadget project", async () => {
      mockGgtUpToDate();

      // no .gadget/sync.json anywhere — not a gadget project
      await warnIfUpdateAvailable(testCtx);

      expectStdout().toBe("");
    });

    it("skips agent plugin check when no stored SHA exists", async () => {
      const directory = await makeProjectDir("no-sha");
      await fs.outputFile(directory.absolute(".gadget/sync.json"), "{}");

      mockGgtUpToDate();

      // in a gadget project but agent plugin was never installed via ggt
      process.chdir(directory.path);
      await warnIfUpdateAvailable(testCtx);

      expectStdout().toBe("");
    });

    it("skips agent plugin check when SHA matches latest", async () => {
      const directory = await makeProjectDir("sha-matches");
      await fs.outputFile(directory.absolute(".gadget/sync.json"), "{}");
      await fs.outputFile(agentPluginShaPath(directory), "abc123");

      mockGgtUpToDate();
      nock("https://api.github.com").get("/repos/gadget-inc/skills/commits/main").reply(200, { sha: "abc123" });

      process.chdir(directory.path);
      await warnIfUpdateAvailable(testCtx);

      expectStdout().toBe("");
    });

    it("warns when agent plugin SHA differs from latest", async () => {
      const directory = await makeProjectDir("sha-differs");
      await fs.outputFile(directory.absolute(".gadget/sync.json"), "{}");
      await fs.outputFile(agentPluginShaPath(directory), "old-sha");

      mockGgtUpToDate();
      nock("https://api.github.com").get("/repos/gadget-inc/skills/commits/main").reply(200, { sha: "new-sha" });

      process.chdir(directory.path);
      await warnIfUpdateAvailable(testCtx);

      expectStdout().toContain("agent plugin");
      expectStdout().toContain("ggt agent-plugin update");
    });

    it("does not throw when github api fails", async () => {
      const directory = await makeProjectDir("github-fail");
      await fs.outputFile(directory.absolute(".gadget/sync.json"), "{}");
      await fs.outputFile(agentPluginShaPath(directory), "old-sha");

      mockGgtUpToDate();
      nock("https://api.github.com").get("/repos/gadget-inc/skills/commits/main").replyWithError("network error");

      process.chdir(directory.path);
      await warnIfUpdateAvailable(testCtx);

      // should not crash — just skip the agent plugin warning
      expectStdout().toBe("");
    });
  });
});
