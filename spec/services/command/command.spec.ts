import { beforeAll, describe, expect, it } from "vitest";

import { Commands, commandGroups, importCommand, resolveCommandAlias, type CommandConfig } from "../../../src/services/command/command.ts";

describe("commandGroups", () => {
  it("includes every non-hidden command in at least one group", async () => {
    const allGroupedCommands = commandGroups.flatMap((g) => g.commands);
    for (const cmd of Commands) {
      const mod = await importCommand(cmd);
      if (mod.hidden) continue;
      expect(allGroupedCommands, `command "${cmd}" is not in any command group`).toContain(cmd);
    }
  });
});

describe("resolveCommandAlias", () => {
  it("resolves 'envs' to 'env'", async () => {
    await expect(resolveCommandAlias("envs")).resolves.toBe("env");
  });

  it("resolves 'log' to 'logs'", async () => {
    await expect(resolveCommandAlias("log")).resolves.toBe("logs");
  });

  it("resolves 'problem' to 'problems'", async () => {
    await expect(resolveCommandAlias("problem")).resolves.toBe("problems");
  });

  it("returns undefined for an unknown string", async () => {
    await expect(resolveCommandAlias("xyz")).resolves.toBeUndefined();
  });

  it("returns undefined for canonical command name 'env'", async () => {
    await expect(resolveCommandAlias("env")).resolves.toBeUndefined();
  });
});

describe.each(Commands)("%s", (command) => {
  let cmd: CommandConfig;

  beforeAll(async () => {
    cmd = await importCommand(command);
  });

  it("has a description", () => {
    expect(cmd.description).toBeDefined();
    expect(cmd.description).toBeTypeOf("string");
    expect(cmd.description).not.toBe("");
  });

  it("has a run function XOR subcommands", () => {
    const hasRun = "run" in cmd;
    const hasSubs = "subcommands" in cmd;
    expect(hasRun !== hasSubs, `expected exactly one of run/subcommands, got run=${hasRun} subcommands=${hasSubs}`).toBe(true);
  });
});
