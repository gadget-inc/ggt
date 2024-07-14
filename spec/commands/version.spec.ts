import { describe, it } from "vitest";
import { run } from "../../src/commands/version.js";
import { makeContext } from "../__support__/context.js";
import { expectStdout } from "../__support__/output.js";

describe("version", () => {
  it("prints the version", async () => {
    await run(makeContext());

    expectStdout().toEqual("1.2.3\n");
  });
});
