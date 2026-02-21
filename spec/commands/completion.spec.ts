import type { MockInstance } from "vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as completion from "../../src/commands/completion.js";
import { usage } from "../../src/commands/root.js";
import { ArgError } from "../../src/services/command/arg.js";
import { Commands, importCommand } from "../../src/services/command/command.js";
import {
  generateBashCompletions,
  generateFishCompletions,
  generateZshCompletions,
  getCompletionData,
} from "../../src/services/completion/index.js";
import { testCtx } from "../__support__/context.js";
import { expectError } from "../__support__/error.js";
import { expectStdout } from "../__support__/output.js";

describe("completion", () => {
  describe("data model", () => {
    it("includes root flags", async () => {
      const data = await getCompletionData();

      const helpFlag = data.rootFlags.find((f) => f.name === "--help");
      const verboseFlag = data.rootFlags.find((f) => f.name === "--verbose");
      const telemetryFlag = data.rootFlags.find((f) => f.name === "--telemetry");
      const jsonFlag = data.rootFlags.find((f) => f.name === "--json");

      expect(helpFlag?.type).toBe("boolean");
      expect(verboseFlag?.type).toBe("count");
      expect(telemetryFlag?.type).toBe("boolean");
      expect(jsonFlag?.type).toBe("boolean");
    });

    it("extracts flag aliases", async () => {
      const data = await getCompletionData();

      const verboseFlag = data.rootFlags.find((f) => f.name === "--verbose");
      const helpFlag = data.rootFlags.find((f) => f.name === "--help");

      expect(verboseFlag?.aliases).toEqual(["-v", "--debug"]);
      expect(helpFlag?.aliases).toEqual([]);
    });

    it("extracts command flags", async () => {
      const data = await getCompletionData();

      const push = data.commands.find((c) => c.name === "push");
      expect(push).toBeDefined();

      const appFlag = push!.flags.find((f) => f.name === "--app");
      const envFlag = push!.flags.find((f) => f.name === "--env");
      const forceFlag = push!.flags.find((f) => f.name === "--force");
      const allowDiffApp = push!.flags.find((f) => f.name === "--allow-different-app");
      const allowUnknown = push!.flags.find((f) => f.name === "--allow-unknown-directory");

      expect(appFlag?.type).toBe("string");
      expect(envFlag?.type).toBe("string");
      expect(forceFlag?.type).toBe("boolean");
      expect(allowDiffApp?.type).toBe("boolean");
      expect(allowUnknown?.type).toBe("boolean");
    });

    it("includes var subcommands", async () => {
      const data = await getCompletionData();

      const varCmd = data.commands.find((c) => c.name === "var");
      expect(varCmd).toBeDefined();
      expect(varCmd!.subcommands).toHaveLength(5);

      const names = varCmd!.subcommands.map((s) => s.name);
      expect(names).toEqual(["list", "get", "set", "delete", "import"]);
    });

    it("includes var subcommand flags", async () => {
      const data = await getCompletionData();

      const varCmd = data.commands.find((c) => c.name === "var");
      expect(varCmd).toBeDefined();

      const deleteSub = varCmd!.subcommands.find((s) => s.name === "delete");
      expect(deleteSub).toBeDefined();
      expect(deleteSub!.flags.find((f) => f.name === "--force")).toBeDefined();
      expect(deleteSub!.flags.find((f) => f.name === "--all")).toBeDefined();

      const importSub = varCmd!.subcommands.find((s) => s.name === "import");
      expect(importSub).toBeDefined();
      expect(importSub!.flags.find((f) => f.name === "--from")).toBeDefined();
      expect(importSub!.flags.find((f) => f.name === "--from-file")).toBeDefined();
      expect(importSub!.flags.find((f) => f.name === "--include-values")).toBeDefined();
      expect(importSub!.flags.find((f) => f.name === "--all")).toBeDefined();
    });

    it("includes configure subcommands", async () => {
      const data = await getCompletionData();

      const configureCmd = data.commands.find((c) => c.name === "configure");
      expect(configureCmd).toBeDefined();
      expect(configureCmd!.subcommands).toHaveLength(3);

      const names = configureCmd!.subcommands.map((s) => s.name);
      expect(names).toEqual(["show", "change", "clear"]);
    });

    it("includes agent-plugin subcommands", async () => {
      const data = await getCompletionData();

      const agentPlugin = data.commands.find((c) => c.name === "agent-plugin");
      expect(agentPlugin).toBeDefined();
      expect(agentPlugin!.subcommands).toHaveLength(1);
      expect(agentPlugin!.subcommands[0]!.name).toBe("install");
      expect(agentPlugin!.subcommands[0]!.flags.find((f) => f.name === "--force")).toBeDefined();
    });

    it("includes completion subcommands", async () => {
      const data = await getCompletionData();

      const completionCmd = data.commands.find((c) => c.name === "completion");
      expect(completionCmd).toBeDefined();

      const names = completionCmd!.subcommands.map((s) => s.name);
      expect(names).toEqual(["bash", "zsh", "fish"]);
    });
  });

  describe("shell generators", () => {
    it("bash generator produces valid script", async () => {
      const data = await getCompletionData();
      const output = generateBashCompletions(data);

      expect(output).toContain("_ggt_completions");
      expect(output).toContain("complete -o default -F _ggt_completions ggt");
      expect(output).toMatch(/case.*\b(dev|deploy|var)\b/s);
    });

    it("bash generator includes all non-hidden commands", async () => {
      const data = await getCompletionData();
      const output = generateBashCompletions(data);

      for (const cmd of data.commands) {
        expect(output).toContain(cmd.name);
      }
    });

    it("zsh generator produces valid script", async () => {
      const data = await getCompletionData();
      const output = generateZshCompletions(data);

      expect(output).toMatch(/^#compdef ggt/);
      expect(output).toContain("_ggt");
      expect(output).toMatch(/_ggt "\$@"\n$/);
    });

    it("zsh generator includes all non-hidden commands", async () => {
      const data = await getCompletionData();
      const output = generateZshCompletions(data);

      for (const cmd of data.commands) {
        expect(output).toContain(cmd.name);
      }
    });

    it("fish generator produces valid script", async () => {
      const data = await getCompletionData();
      const output = generateFishCompletions(data);

      expect(output).toContain("complete -c ggt -f");
      expect(output).toContain("complete -c ggt");
    });

    it("fish generator includes all non-hidden commands", async () => {
      const data = await getCompletionData();
      const output = generateFishCompletions(data);

      for (const cmd of data.commands) {
        expect(output).toContain(cmd.name);
      }
    });

    it("all generators include var subcommand flags", async () => {
      const data = await getCompletionData();
      const bash = generateBashCompletions(data);
      const zsh = generateZshCompletions(data);
      const fish = generateFishCompletions(data);

      // bash and zsh use --flag format
      for (const output of [bash, zsh]) {
        expect(output).toContain("--secret");
        expect(output).toContain("--from-file");
        expect(output).toContain("--include-values");
      }

      // fish uses -l flag (without --) format
      expect(fish).toContain("secret");
      expect(fish).toContain("from-file");
      expect(fish).toContain("include-values");
    });
  });

  describe("command", () => {
    let writeSpy: MockInstance;

    beforeEach(() => {
      writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    });

    afterEach(() => {
      writeSpy.mockRestore();
    });

    it("outputs bash completions", async () => {
      await completion.run(testCtx, { _: ["bash"] });

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy.mock.calls[0]![0]).toContain("_ggt_completions");
    });

    it("outputs zsh completions", async () => {
      await completion.run(testCtx, { _: ["zsh"] });

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy.mock.calls[0]![0]).toContain("#compdef ggt");
    });

    it("outputs fish completions", async () => {
      await completion.run(testCtx, { _: ["fish"] });

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy.mock.calls[0]![0]).toContain("complete -c ggt");
    });

    it("prints usage when no shell specified", async () => {
      await completion.run(testCtx, { _: [] });

      expectStdout().toContain("source <(ggt completion bash)");
    });

    it("throws ArgError for unsupported shell", async () => {
      const error = await expectError(() => completion.run(testCtx, { _: ["powershell"] }));

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("powershell");
    });
  });

  describe("completeness guard", () => {
    it("completion data covers all non-hidden registered commands", async () => {
      const data = await getCompletionData();

      for (const cmd of Commands) {
        const mod = await importCommand(cmd);
        if (mod.hidden) {
          expect(
            data.commands.find((c) => c.name === cmd),
            `hidden command "${cmd}" should not appear in completion data`,
          ).toBeUndefined();
        } else {
          expect(
            data.commands.find((c) => c.name === cmd),
            `missing completion data for command: ${cmd}`,
          ).toBeDefined();
        }
      }
    });

    it("all commands have descriptions", async () => {
      const data = await getCompletionData();

      for (const cmd of data.commands) {
        expect(cmd.description, `command "${cmd.name}" has no description`).not.toBe("");
      }
    });

    it("all flags have descriptions", async () => {
      const data = await getCompletionData();

      for (const cmd of data.commands) {
        for (const flag of cmd.flags) {
          expect(flag.description, `flag "${flag.name}" on command "${cmd.name}" has no description`).not.toBe("");
        }
        for (const sub of cmd.subcommands) {
          for (const flag of sub.flags) {
            expect(flag.description, `flag "${flag.name}" on subcommand "${cmd.name} ${sub.name}" has no description`).not.toBe("");
          }
        }
      }
    });

    it("root.ts usage text matches command descriptions for listed commands", async () => {
      const usageText = await usage();

      for (const cmd of Commands) {
        const mod = await importCommand(cmd);

        // hidden commands should not appear in the usage text
        if (mod.hidden) {
          expect(usageText, `hidden command "${cmd}" should not appear in root usage`).not.toContain(`  ${cmd} `);
          continue;
        }

        if (mod.description) {
          expect(usageText, `root usage text does not contain description for "${cmd}"`).toContain(mod.description);
        }
      }
    });

    it("subcommand registry matches command module exports", async () => {
      const data = await getCompletionData();

      for (const cmd of Commands) {
        const mod = await importCommand(cmd);
        if (mod.hidden) {
          continue;
        }

        const def = data.commands.find((c) => c.name === cmd);
        expect(def, `missing completion data for command: ${cmd}`).toBeDefined();

        const expectedNames = (mod.subcommandDefs ?? []).map((s) => s.name);
        const actualNames = def!.subcommands.map((s) => s.name);
        expect(actualNames, `subcommand mismatch for "${cmd}"`).toEqual(expectedNames);
      }
    });
  });
});
