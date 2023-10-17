import fs from "fs-extra";
import ms from "ms";
import nock from "nock";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { config } from "../../src/services/config.js";
import { getDistTags, shouldCheckForUpdate, warnIfUpdateAvailable } from "../../src/services/version.js";
import { expectStdout } from "../util.js";

describe("version", () => {
  describe("getDistTags", () => {
    it("returns the dist tags", async () => {
      const distTags = {
        latest: "1.0.0",
      };

      nock("https://registry.npmjs.org").get("/ggt").reply(200, {
        name: "ggt",
        "dist-tags": distTags,
      });

      await expect(getDistTags()).resolves.toEqual(distTags);
    });

    it("throws if the response is invalid", async () => {
      nock("https://registry.npmjs.org")
        .get("/ggt")
        .reply(200, {
          name: "not-ggt",
          "dist-tags": {
            latest: "1.0.0",
          },
        });

      await expect(getDistTags()).rejects.toThrow();
    });
  });

  describe("shouldCheckForUpdate", () => {
    it("returns true if the last check was more than 12 hours ago", async () => {
      const lastCheck = Date.now() - ms("13 hours");

      await fs.outputFile(path.join(config.cacheDir, "last-update-check"), String(lastCheck));

      await expect(shouldCheckForUpdate()).resolves.toBeTruthy();
    });

    it("returns false if the last check was less than 12 hours ago", async () => {
      const lastCheck = Date.now() - ms("11 hours");

      await fs.outputFile(path.join(config.cacheDir, "last-update-check"), String(lastCheck));

      await expect(shouldCheckForUpdate()).resolves.toBeFalsy();
    });
  });

  describe("warnIfUpdateAvailable", () => {
    it("logs a warning if an update is available", async () => {
      vi.spyOn(config, "version", "get").mockReturnValue("1.0.0");

      nock("https://registry.npmjs.org")
        .get("/ggt")
        .reply(200, {
          name: "ggt",
          "dist-tags": {
            latest: "1.0.1",
          },
        });

      await expect(shouldCheckForUpdate()).resolves.toBeTruthy();

      await warnIfUpdateAvailable();

      await expect(shouldCheckForUpdate()).resolves.toBeFalsy();

      expectStdout().toMatchInlineSnapshot(`
        "╭──────────────────────────────────────────────────────────────────────╮
        │                                                                      │
        │                  Update available! 1.0.0 -> 1.0.1.                   │
        │   Changelog: https://github.com/gadget-inc/ggt/releases/tag/v1.0.1   │
        │                 Run \\"npm install -g ggt\\" to update.                  │
        │                                                                      │
        ╰──────────────────────────────────────────────────────────────────────╯
        "
      `);
    });

    it("does nothing if already at latest version", async () => {
      vi.spyOn(config, "version", "get").mockReturnValue("1.0.0");

      nock("https://registry.npmjs.org")
        .get("/ggt")
        .reply(200, {
          name: "ggt",
          "dist-tags": {
            latest: "1.0.0",
          },
        });

      await expect(shouldCheckForUpdate()).resolves.toBeTruthy();

      await warnIfUpdateAvailable();

      await expect(shouldCheckForUpdate()).resolves.toBeFalsy();

      expectStdout().toBe("");
    });
  });
});
