import { describe, it } from "vitest";

import * as agentPlugin from "../../src/commands/agent-plugin.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { expectStdout } from "../__support__/output.js";

describe("agent-plugin", () => {
  it("prints usage when no subcommand is given", async () => {
    await agentPlugin.run(testCtx, makeArgs(agentPlugin.args, "agent-plugin"));

    expectStdout().toContain("ggt agent-plugin install");
    expectStdout().toContain("ggt agent-plugin update");
  });

  it("prints usage for unknown subcommand", async () => {
    await agentPlugin.run(testCtx, makeArgs(agentPlugin.args, "agent-plugin", "foo"));

    expectStdout().toContain("ggt agent-plugin install");
  });
});
