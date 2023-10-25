import { isFunction } from "lodash";
import { beforeAll, describe, expect, it } from "vitest";
import { availableCommands, type Command } from "../../src/commands/index.js";

describe.each(availableCommands)("%s", (name) => {
  let command: Command;

  beforeAll(async () => {
    command = await import(`../../src/commands/${name}.ts`);
  });

  it("has a usage string", () => {
    expect(command.usage).toBeDefined();
    expect(command.usage).toMatchSnapshot();
  });

  it("has a run function", () => {
    expect(command.run).toBeDefined();
    expect(isFunction(command.run)).toBe(true);
  });

  it("may have an init function", () => {
    if (command.init) {
      expect(isFunction(command.init)).toBe(true);
    } else {
      expect(command.init).toBeUndefined();
    }
  });
});
