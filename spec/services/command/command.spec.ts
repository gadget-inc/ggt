import { beforeAll, describe, expect, it } from "vitest";
import { AvailableCommands, importCommand, type CommandSpec } from "../../../src/services/command/command.js";
import { mockVersion } from "../../__support__/version.js";

describe.each(AvailableCommands)("%s", (command) => {
  mockVersion();

  let cmd: CommandSpec;

  beforeAll(async () => {
    cmd = await importCommand(command);
  });

  it("has a usage", () => {
    expect(cmd.usage).toBeDefined();
    expect(cmd.usage).toBeInstanceOf(Function);
    expect(cmd.usage()).toMatchSnapshot();
  });

  it("has a command", () => {
    expect(cmd.command).toBeDefined();
    expect(cmd.command).toBeInstanceOf(Function);
  });
});
