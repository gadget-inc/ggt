import { beforeAll, describe, expect, it } from "vitest";
import { Commands, importCommand, type CommandModule } from "../../../src/services/command/command.js";
import { makeRootContext } from "../../__support__/context.js";

describe.each(Commands)("%s", (command) => {
  let cmd: CommandModule;

  beforeAll(async () => {
    cmd = await importCommand(command);
  });

  it("has a usage", () => {
    expect(cmd.usage).toBeDefined();
    expect(cmd.usage).toBeInstanceOf(Function);
    expect(cmd.usage(makeRootContext())).toBeTypeOf("string");
  });

  it("has a command", () => {
    expect(cmd.command).toBeDefined();
    expect(cmd.command).toBeInstanceOf(Function);
  });
});
