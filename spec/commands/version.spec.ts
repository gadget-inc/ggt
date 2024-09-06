import { describe, it } from "vitest";
import * as version from "../../src/commands/version.js";
import { testCtx } from "../__support__/context.js";
import { expectStdout } from "../__support__/output.js";

describe("version", () => {
  it("prints the version", async () => {
    await version.run(testCtx, { _: [] });

    expectStdout().toEqual("1.2.3\n");
  });
});
