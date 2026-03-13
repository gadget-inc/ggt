import { describe, it } from "vitest";

import version from "../../src/commands/version.ts";
import { runCommand } from "../../src/services/command/run.ts";
import { testCtx } from "../__support__/context.ts";
import { expectStdout } from "../__support__/output.ts";

describe("version", () => {
  it("prints the version", async () => {
    await runCommand(testCtx, version);

    expectStdout().toEqual("1.2.3\n");
  });
});
