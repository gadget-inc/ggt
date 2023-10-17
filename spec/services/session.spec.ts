import fs from "fs-extra";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { config } from "../../src/services/config.js";
import { readSession, writeSession } from "../../src/services/session.js";

describe("session", () => {
  describe("readSession", () => {
    it("loads session.txt from the filesystem", () => {
      fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName!);

      expect(readSession()).toBe(expect.getState().currentTestName);
    });

    it.skip("caches the session in memory", () => {
      fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName!);
      vi.spyOn(fs, "readFileSync");

      for (let i = 0; i < 10; i++) {
        expect(readSession()).toBe(expect.getState().currentTestName);
      }

      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it("does not throw ENOENT if the file does not exist", () => {
      expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);

      expect(readSession()).toBeUndefined();
    });
  });

  describe("writeSession", () => {
    it("saves session.txt to the filesystem", () => {
      expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);

      writeSession(expect.getState().currentTestName);

      expect(fs.readFileSync(path.join(config.configDir, "session.txt"), "utf-8")).toEqual(expect.getState().currentTestName);
    });

    it("removes session.txt from the filesystem", () => {
      fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName!);
      expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(true);

      writeSession(undefined);

      expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);
    });
  });
});
