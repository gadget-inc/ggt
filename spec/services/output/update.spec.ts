import fs from "fs-extra";
import ms from "ms";
import nock from "nock";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Context } from "../../../src/services/command/context.js";
import { config } from "../../../src/services/config/config.js";
import { getDistTags, shouldCheckForUpdate, warnIfUpdateAvailable } from "../../../src/services/output/update.js";
import { packageJson } from "../../../src/services/util/package-json.js";
import { makeContext, testCtx } from "../../__support__/context.js";
import { expectStdout } from "../../__support__/output.js";

describe("getDistTags", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("returns the dist tags", async () => {
    const distTags = {
      latest: "1.0.0",
      experimental: "0.0.0-experimental.41b05e2",
    };

    nock("https://registry.npmjs.org").get("/ggt").reply(200, {
      name: "ggt",
      "dist-tags": distTags,
    });

    await expect(getDistTags(ctx)).resolves.toEqual(distTags);
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

    await expect(getDistTags(ctx)).rejects.toThrow();
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
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

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

    await warnIfUpdateAvailable(ctx);

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

    await warnIfUpdateAvailable(ctx);

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeFalsy();

    try {
      expectStdout().toMatchInlineSnapshot(`
      "╭───────────────────────────────────────────────────────────────────────────────╮
      │                                                                               │
      │   Update available! 0.0.0-experimental.bf3e4a3 → 0.0.0-experimental.41b05e2   │
      │               Run "npm install -g ggt@experimental" to update.                │
      │                                                                               │
      ╰───────────────────────────────────────────────────────────────────────────────╯
      "
    `);
    } catch {
      // the message is wrapped differently on CI for some reason...
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
    }
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

    await warnIfUpdateAvailable(ctx);

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeFalsy();

    expectStdout().toBe("");
  });
});
