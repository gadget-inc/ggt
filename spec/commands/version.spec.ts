import { describe, it } from "vitest";

import version from "../../src/commands/version.js";
import { runCommand } from "../../src/services/command/run.js";
import { testCtx } from "../__support__/context.js";
import { expectStdout } from "../__support__/output.js";

describe("version", () => {
  it("prints the version", async () => {
    await runCommand(testCtx, version);

    expectStdout().toEqual("1.2.3\n");
  });
});
