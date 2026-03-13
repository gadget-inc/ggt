import { describe, expect, it } from "vitest";

import agentPluginCommand from "../../src/commands/agent-plugin.ts";
import { FlagError } from "../../src/services/command/flag.ts";
import { runCommand } from "../../src/services/command/run.ts";
import { testCtx } from "../__support__/context.ts";
import { expectError } from "../__support__/error.ts";

describe("agent-plugin", () => {
  it("throws for unknown subcommand", async () => {
    const error = await expectError(() => runCommand(testCtx, agentPluginCommand, "foo"));

    expect(error).toBeInstanceOf(FlagError);
    expect(error.message).toMatchInlineSnapshot(`
      "Unknown subcommand foo

      Did you mean update?

      USAGE
        ggt agent-plugin <command>

      Run ggt agent-plugin -h for more information."
    `);
  });
});
