import { beforeAll, describe, expect, it } from "vitest";
import { availableCommands, type CommandModule } from "../../src/commands/index.js";
import { isFunction } from "../../src/services/is.js";

describe.each(availableCommands)("%s", (name) => {
  let mod: CommandModule;

  beforeAll(async () => {
    mod = await import(`../../src/commands/${name}.ts`);
  });

  it("has a usage string", () => {
    expect(mod.usage).toBeDefined();
    expect(mod.usage).toMatchSnapshot();
  });

  it("has a command function", () => {
    expect(mod.command).toBeDefined();
    expect(isFunction(mod.command)).toBe(true);
  });

  it("may have an init function", () => {
    if (mod.init) {
      expect(isFunction(mod.init)).toBe(true);
    } else {
      expect(mod.init).toBeUndefined();
    }
  });
});
