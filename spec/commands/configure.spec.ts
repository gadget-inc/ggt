import { describe, expect, it, vi } from "vitest";

import configure from "../../src/commands/configure.js";
import { FlagError } from "../../src/services/command/flag.js";
import { runCommand } from "../../src/services/command/run.js";
import * as defaults from "../../src/services/config/defaults.js";
import { noop } from "../../src/services/util/function.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { mock } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { expectProcessExit } from "../__support__/process.js";

describe("configure", () => {
  it("can show configuration", async () => {
    mock(defaults, "loadDefaultsConfig", (_ctx, _prompt) => {
      return { telemetry: true, json: true };
    });

    await runCommand(testCtx, configure, "show");

    expect(defaults.loadDefaultsConfig).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }), false);
    expectStdout().toMatchInlineSnapshot(`
"╔═══════════╤══════════════════╗
║ Option    │ Configured Value ║
╟───────────┼──────────────────╢
║ telemetry │ true             ║
╟───────────┼──────────────────╢
║ json      │ true             ║
╚═══════════╧══════════════════╝
"`);
  });

  it("can show undefined configuration", async () => {
    mock(defaults, "loadDefaultsConfig", (_ctx, _prompt) => {
      return {};
    });

    await runCommand(testCtx, configure, "show");

    expect(defaults.loadDefaultsConfig).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }), false);
    expectStdout().toMatchInlineSnapshot(`
"╔═══════════╤══════════════════╗
║ Option    │ Configured Value ║
╟───────────┼──────────────────╢
║ telemetry │ undefined        ║
╟───────────┼──────────────────╢
║ json      │ undefined        ║
╚═══════════╧══════════════════╝
"`);
  });

  it("can clear configuration", async () => {
    mock(defaults, "clearDefaultsConfig", noop);

    await runCommand(testCtx, configure, "clear");

    expect(defaults.clearDefaultsConfig).toHaveBeenCalled();
  });

  it("cannot prompt for configuration while not interactive", async () => {
    vi.spyOn(defaults, "promptDefaultsConfig");

    await expectProcessExit(() => runCommand(testCtx, configure, "change"), 1);

    expect(defaults.promptDefaultsConfig).toHaveBeenCalled();
  });

  it("accepts prompt for configuration", async () => {
    mock(defaults, "promptDefaultsConfig", (_ctx) => {
      return { telemetry: true, json: true };
    });

    await runCommand(testCtx, configure, "change");

    expect(defaults.promptDefaultsConfig).toHaveBeenCalled();
  });

  it("throws FlagError for unknown subcommand", async () => {
    const error = await expectError(() => runCommand(testCtx, configure, "bogus"));
    expect(error).toBeInstanceOf(FlagError);
    expect(error.message).toMatchInlineSnapshot(`
      "Unknown subcommand bogus

      Did you mean show?

      USAGE
        ggt configure <command>

      Run ggt configure -h for more information."
    `);
  });
});
