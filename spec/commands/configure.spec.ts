import { describe, expect, it, vi } from "vitest";
import * as configure from "../../src/commands/configure.js";
import * as defaults from "../../src/services/config/defaults.js";
import { noop } from "../../src/services/util/function.js";
import { makeRootArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { mock } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { expectProcessExit } from "../__support__/process.js";

describe("configure", () => {
  it("can show configuration", async () => {
    mock(defaults, "loadDefaultsConfig", (_ctx, _prompt) => {
      return { telemetry: true, json: true };
    });

    await configure.run(testCtx, makeRootArgs("show"));

    expect(defaults.loadDefaultsConfig).toHaveBeenCalled();
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

    await configure.run(testCtx, makeRootArgs("show"));

    expect(defaults.loadDefaultsConfig).toHaveBeenCalledWith(testCtx, false);
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

    await configure.run(testCtx, makeRootArgs("clear"));

    expect(defaults.clearDefaultsConfig).toHaveBeenCalled();
  });

  it("cannot prompt for configuration while not interactive", async () => {
    vi.spyOn(defaults, "promptDefaultsConfig");

    await expectProcessExit(() => configure.run(testCtx, makeRootArgs("change")), 1);

    expect(defaults.promptDefaultsConfig).toHaveBeenCalledWith(testCtx);
  });

  it("accepts prompt for configuration", async () => {
    mock(defaults, "promptDefaultsConfig", (_ctx) => {
      return { telemetry: true, json: true };
    });

    await configure.run(testCtx, makeRootArgs("change"));

    expect(defaults.promptDefaultsConfig).toHaveBeenCalledWith(testCtx);
  });
});
