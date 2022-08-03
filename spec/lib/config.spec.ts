import fs from "fs-extra";
import { Config } from "../../src/lib/config";

describe("Config", () => {
  it("saves itself to the filesystem", () => {
    Config.session = "test";

    Config.save();

    expect(fs.readJsonSync(Config.filepath)).toEqual({ session: "test" });
  });

  it("loads itself from the filesystem", () => {
    fs.outputJsonSync(Config.filepath, { session: "test" });

    Config.reload();

    expect(Config.session).toBe("test");
  });

  it("does not throw ENOENT if the file does not exist", () => {
    fs.removeSync(Config.filepath);

    expect(Config.reload).not.toThrow();
  });
});
