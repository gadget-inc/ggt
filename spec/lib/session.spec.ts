import fs from "fs-extra";
import path from "path";
import { config } from "../../src/lib/config";
import { getSession, setSession } from "../../src/lib/session";

describe("getSession", () => {
  it("loads from the filesystem", () => {
    setSession(undefined);

    fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName);

    expect(getSession()).toBe(expect.getState().currentTestName);
  });

  it("caches the session in memory", () => {
    fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName);
    jest.spyOn(fs, "readFileSync");

    for (let i = 0; i < 10; i++) {
      expect(getSession()).toBe(expect.getState().currentTestName);
    }

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("does not throw ENOENT if the file does not exist", () => {
    expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);

    expect(getSession()).toBeUndefined();
  });
});

describe("setSession", () => {
  it("saves session.txt to the filesystem", () => {
    expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);

    setSession(expect.getState().currentTestName);

    expect(fs.readFileSync(path.join(config.configDir, "session.txt"), "utf-8")).toEqual(expect.getState().currentTestName);
  });

  it("removes session.txt from the filesystem", () => {
    fs.outputFileSync(path.join(config.configDir, "session.txt"), expect.getState().currentTestName);
    expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(true);

    setSession(undefined);

    expect(fs.existsSync(path.join(config.configDir, "session.txt"))).toBe(false);
  });
});
