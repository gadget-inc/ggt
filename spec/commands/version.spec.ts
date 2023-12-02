import { describe, it } from "vitest";
import { command } from "../../src/commands/version.js";
import { Context } from "../../src/services/command/context.js";
import { expectStdout } from "../__support__/stdout.js";
import { mockVersion } from "../__support__/version.js";

describe("version", () => {
  mockVersion();

  it("prints the version", async () => {
    await command(new Context({ _: [] }));

    expectStdout().toEqual("1.2.3\n");
  });
});
