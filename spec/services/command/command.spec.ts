import { beforeAll, describe, expect, it } from "vitest";

import { Commands, importCommand, type CommandModule } from "../../../src/services/command/command.js";

describe.each(Commands)("%s", (command) => {
  let cmd: CommandModule;

  beforeAll(async () => {
    cmd = await importCommand(command);
  });

  it("has a description", () => {
    expect(cmd.description).toBeDefined();
    expect(cmd.description).toBeTypeOf("string");
  });

  it("has a run function", () => {
    expect(cmd.run).toBeDefined();
    expect(cmd.run).toBeInstanceOf(Function);
  });
});
