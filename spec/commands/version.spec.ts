import { describe, it } from "vitest";
import { command } from "../../src/commands/version.js";
import { makeContext } from "../__support__/context.js";
import { expectStdout } from "../__support__/output.js";

describe("version", () => {
  it("prints the version", async () => {
    await command(makeContext());

    expectStdout().toEqual("1.2.3\n");
  });
});
