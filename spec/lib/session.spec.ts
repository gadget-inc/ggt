import fs from "fs-extra";
import path from "path";
import { config } from "../../src/lib/config";
import { session } from "../../src/lib/session";

describe("Session", () => {
  describe("get", () => {
    it("loads session.txt from the filesystem", () => {
      session.set(undefined);

      fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName);

      expect(session.get()).toBe(expect.getState().currentTestName);
    });

    it("caches the session in memory", () => {
      fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName);
      jest.spyOn(fs, "readFileSync");

      for (let i = 0; i < 10; i++) {
        expect(session.get()).toBe(expect.getState().currentTestName);
      }

      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it("does not throw ENOENT if the file does not exist", () => {
      expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);

      expect(session.get()).toBeUndefined();
    });
  });

  describe("set", () => {
    it("saves session.txt to the filesystem", () => {
      expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);

      session.set(expect.getState().currentTestName);

      expect(fs.readFileSync(path.join(config.configDir, "session.txt"), "utf-8")).toEqual(expect.getState().currentTestName);
    });

    it("removes session.txt from the filesystem", () => {
      fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName);
      expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(true);

      session.set(undefined);

      expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);
    });

    it("returns true if the session existed", () => {
      fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName);

      expect(session.set(undefined)).toBeTrue();
    });

    it("returns false if the session did not exist", () => {
      expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);

      expect(session.set(undefined)).toBeFalse();
    });
  });
});
