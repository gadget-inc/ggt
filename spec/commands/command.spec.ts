import { beforeAll, describe, expect, it } from "vitest";
import { AvailableCommands, importCommandModule, type CommandModule } from "../../src/commands/command.js";

describe.each(AvailableCommands)("%s", (command) => {
  let mod: CommandModule;

  beforeAll(async () => {
    mod = await importCommandModule(command);
  });

  it("has a usage", () => {
    expect(mod.usage).toBeDefined();
    expect(mod.usage).toBeInstanceOf(Function);
    expect(mod.usage()).toMatchSnapshot();
  });

  it("has a command", () => {
    expect(mod.command).toBeDefined();
    expect(mod.command).toBeInstanceOf(Function);
  });
});
