import { beforeAll, describe, expect, it } from "vitest";
import { Commands, importCommand, type CommandModule } from "../../../src/services/command/command.js";
import { mockVersion } from "../../__support__/version.js";

describe.each(Commands)("%s", (command) => {
  mockVersion();

  let cmd: CommandModule;

  beforeAll(async () => {
    cmd = await importCommand(command);
  });

  it("has a usage", () => {
    expect(cmd.usage).toBeDefined();
    expect(cmd.usage).toBeInstanceOf(Function);
    expect(cmd.usage()).toBeTypeOf("string");
  });

  it("has a command", () => {
    expect(cmd.command).toBeDefined();
    expect(cmd.command).toBeInstanceOf(Function);
  });
});
