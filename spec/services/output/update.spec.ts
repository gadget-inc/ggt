import fs from "fs-extra";
import ms from "ms";
import { http } from "msw";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../../../src/services/config/config.js";
import { getDistTags, shouldCheckForUpdate, warnIfUpdateAvailable } from "../../../src/services/output/update.js";
import { packageJson } from "../../../src/services/util/package-json.js";
import { testCtx } from "../../__support__/context.js";
import { mockServer } from "../../__support__/msw.js";
import { expectStdout } from "../../__support__/output.js";

describe("getDistTags", () => {
  it("returns the dist tags", async () => {
    const distTags = {
      latest: "1.0.0",
      experimental: "0.0.0-experimental.41b05e2",
    };

    mockServer.use(
      http.get("https://registry.npmjs.org/ggt", () => {
        return Response.json({
          name: "ggt",
          "dist-tags": distTags,
        });
      }),
    );

    await expect(getDistTags(testCtx)).resolves.toEqual(distTags);
  });

  it("throws if the response is invalid", async () => {
    mockServer.use(
      http.get("https://registry.npmjs.org/ggt", () => {
        return Response.json({
          name: "not-ggt",
          "dist-tags": {
            latest: "1.0.0",
            experimental: "0.0.0-experimental.41b05e2",
          },
        });
      }),
    );

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

    mockServer.use(
      http.get("https://registry.npmjs.org/ggt", () => {
        return Response.json({
          name: "ggt",
          "dist-tags": {
            latest: "1.0.1",
            experimental: "0.0.0-experimental.41b05e2",
          },
        });
      }),
    );

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

    mockServer.use(
      http.get("https://registry.npmjs.org/ggt", () => {
        return Response.json({
          name: "ggt",
          "dist-tags": {
            latest: "1.0.1",
            experimental: "0.0.0-experimental.41b05e2",
          },
        });
      }),
    );

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

    mockServer.use(
      http.get("https://registry.npmjs.org/ggt", () => {
        return Response.json({
          name: "ggt",
          "dist-tags": {
            latest: "1.0.0",
            experimental: "0.0.0-experimental.41b05e2",
          },
        });
      }),
    );

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeTruthy();

    await warnIfUpdateAvailable(testCtx);

    await expect(shouldCheckForUpdate(testCtx)).resolves.toBeFalsy();

    expectStdout().toBe("");
  });
});
