import { beforeAll, describe, expect, it } from "vitest";
import { Commands, importCommand, type CommandModule } from "../../../src/services/command/command.js";
import { testCtx } from "../../__support__/context.js";

describe.each(Commands)("%s", (command) => {
  let cmd: CommandModule;

  beforeAll(async () => {
    cmd = await importCommand(command);
  });

  it("has a usage function", () => {
    expect(cmd.usage).toBeDefined();
    expect(cmd.usage).toBeInstanceOf(Function);
    expect(cmd.usage(testCtx)).toBeTypeOf("string");
  });

  it("has a run function", () => {
    expect(cmd.run).toBeDefined();
    expect(cmd.run).toBeInstanceOf(Function);
  });
});
