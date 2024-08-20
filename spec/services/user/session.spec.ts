import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { configPath } from "../../../src/services/config/config.js";
import { readSession, writeSession } from "../../../src/services/user/session.js";
import { testCtx } from "../../__support__/context.js";

describe("session", () => {
  describe("readSession", () => {
    it("loads session.txt from the filesystem", () => {
      fs.outputFileSync(configPath("session.txt"), expect.getState().currentTestName!);

      expect(readSession(testCtx)).toBe(expect.getState().currentTestName);
    });

    it("does not throw ENOENT if the file does not exist", () => {
      expect(fs.existsSync(configPath("session.txt"))).toBe(false);

      expect(readSession(testCtx)).toBeUndefined();
    });
  });

  describe("writeSession", () => {
    it("saves session.txt to the filesystem", () => {
      expect(fs.existsSync(configPath("session.txt"))).toBe(false);

      writeSession(testCtx, expect.getState().currentTestName);

      expect(fs.readFileSync(configPath("session.txt"), "utf8")).toEqual(expect.getState().currentTestName);
    });

    it("removes session.txt from the filesystem", () => {
      fs.outputFileSync(configPath("session.txt"), expect.getState().currentTestName!);
      expect(fs.existsSync(configPath("session.txt"))).toBe(true);

      writeSession(testCtx, undefined);

      expect(fs.existsSync(configPath("session.txt"))).toBe(false);
    });
  });
});
