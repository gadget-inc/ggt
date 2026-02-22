import type { MockInstance } from "vitest";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as completion from "../../src/commands/completion.js";
import { usage } from "../../src/commands/root.js";
import { ArgError } from "../../src/services/command/arg.js";
import { Commands, importCommand } from "../../src/services/command/command.js";
import {
  type CompletionData,
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
    let data: CompletionData;

    beforeAll(async () => {
      data = await getCompletionData();
    });

    it("includes root flags", () => {
      const helpFlag = data.rootFlags.find((f) => f.name === "--help");
      expect(helpFlag).toBeDefined();
      const verboseFlag = data.rootFlags.find((f) => f.name === "--verbose");
      expect(verboseFlag).toBeDefined();
      const telemetryFlag = data.rootFlags.find((f) => f.name === "--telemetry");
      expect(telemetryFlag).toBeDefined();
      const jsonFlag = data.rootFlags.find((f) => f.name === "--json");
      expect(jsonFlag).toBeDefined();

      expect(helpFlag!.type).toBe("boolean");
      expect(verboseFlag!.type).toBe("count");
      expect(telemetryFlag!.type).toBe("boolean");
      expect(jsonFlag!.type).toBe("boolean");
    });

    it("extracts flag aliases", () => {
      const verboseFlag = data.rootFlags.find((f) => f.name === "--verbose");
      const helpFlag = data.rootFlags.find((f) => f.name === "--help");

      expect(verboseFlag?.aliases).toEqual(["-v", "--debug"]);
      expect(helpFlag?.aliases).toEqual([]);
    });

    it("extracts command flags", () => {
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

    it("includes var subcommands", () => {
      const varCmd = data.commands.find((c) => c.name === "var");
      expect(varCmd).toBeDefined();
      expect(varCmd!.subcommands).toHaveLength(5);

      const names = varCmd!.subcommands.map((s) => s.name);
      expect(names).toEqual(["list", "get", "set", "delete", "import"]);
    });

    it("includes var subcommand flags", () => {
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

    it("includes configure subcommands", () => {
      const configureCmd = data.commands.find((c) => c.name === "configure");
      expect(configureCmd).toBeDefined();
      expect(configureCmd!.subcommands).toHaveLength(3);

      const names = configureCmd!.subcommands.map((s) => s.name);
      expect(names).toEqual(["show", "change", "clear"]);
    });

    it("includes agent-plugin subcommands", () => {
      const agentPlugin = data.commands.find((c) => c.name === "agent-plugin");
      expect(agentPlugin).toBeDefined();
      expect(agentPlugin!.subcommands).toHaveLength(1);
      expect(agentPlugin!.subcommands[0]!.name).toBe("install");
      expect(agentPlugin!.subcommands[0]!.flags.find((f) => f.name === "--force")).toBeDefined();
    });

    it("includes completion subcommands", () => {
      const completionCmd = data.commands.find((c) => c.name === "completion");
      expect(completionCmd).toBeDefined();

      const names = completionCmd!.subcommands.map((s) => s.name);
      expect(names).toEqual(["bash", "zsh", "fish"]);
    });
  });

  describe("shell generators", () => {
    let data: CompletionData;

    beforeAll(async () => {
      data = await getCompletionData();
    });

    it("bash generator produces valid script", () => {
      const output = generateBashCompletions(data);

      expect(output).toContain("_ggt_completions");
      expect(output).toContain("complete -o default -F _ggt_completions ggt");
      expect(output).toMatch(/case.*\b(dev|deploy|var)\b/s);
    });

    it("bash generator includes all non-hidden commands", () => {
      const output = generateBashCompletions(data);

      for (const cmd of data.commands) {
        expect(output).toContain(cmd.name);
      }
    });

    it("zsh generator produces valid script", () => {
      const output = generateZshCompletions(data);

      expect(output).toMatch(/^#compdef ggt/);
      expect(output).toContain("_ggt");
      expect(output).toMatch(/_ggt "\$@"\n$/);
    });

    it("zsh generator includes all non-hidden commands", () => {
      const output = generateZshCompletions(data);

      for (const cmd of data.commands) {
        expect(output).toContain(cmd.name);
      }
    });

    it("zsh generator includes root flags in leaf command completions", () => {
      const output = generateZshCompletions(data);
      const lines = output.split("\n");

      // find the _arguments block for the dev) case (a command with its own flags)
      const devCaseIdx = lines.findIndex((l) => l.trim().startsWith("dev)"));
      expect(devCaseIdx).toBeGreaterThan(-1);

      // collect lines from dev) to the next ;; to get its _arguments block
      const devBlock = lines.slice(devCaseIdx, lines.indexOf("          ;;", devCaseIdx) + 1).join("\n");
      expect(devBlock).toContain("--help");
      expect(devBlock).toContain("--verbose");

      // find the _arguments block for the whoami) case (a command with no flags of its own)
      const whoamiCaseIdx = lines.findIndex((l) => l.trim().startsWith("whoami)"));
      expect(whoamiCaseIdx).toBeGreaterThan(-1);

      const whoamiBlock = lines.slice(whoamiCaseIdx, lines.indexOf("          ;;", whoamiCaseIdx) + 1).join("\n");
      expect(whoamiBlock).toContain("_arguments");
      expect(whoamiBlock).toContain("--help");
      expect(whoamiBlock).toContain("--verbose");
    });

    it("zsh generator includes root flags in subcommand completions", () => {
      const output = generateZshCompletions(data);
      const lines = output.split("\n");

      // locate the _ggt_var() helper function
      const varFnIdx = lines.findIndex((l) => l.startsWith("_ggt_var()"));
      expect(varFnIdx).toBeGreaterThan(-1);

      // find the _arguments -C block inside the helper
      const argsCIdx = lines.indexOf("  _arguments -C \\", varFnIdx);
      expect(argsCIdx).toBeGreaterThan(-1);

      // collect lines from _arguments -C to the next unindented line
      const argsCBlock: string[] = [];
      for (let i = argsCIdx; i < lines.length; i++) {
        argsCBlock.push(lines[i]!);
        if (!lines[i]!.endsWith("\\")) {
          break;
        }
      }
      const argsCStr = argsCBlock.join("\n");
      expect(argsCStr).toContain("--help");
      expect(argsCStr).toContain("--verbose");

      // find a subcommand case (e.g. delete)) inside the helper and check its _arguments block
      const deleteCaseIdx = lines.findIndex((l, idx) => idx > varFnIdx && l.trim().startsWith("delete)"));
      expect(deleteCaseIdx).toBeGreaterThan(-1);

      const deleteBlock = lines.slice(deleteCaseIdx, lines.indexOf("          ;;", deleteCaseIdx) + 1).join("\n");
      expect(deleteBlock).toContain("--help");
      expect(deleteBlock).toContain("--verbose");
    });

    it("fish generator produces valid script", () => {
      const output = generateFishCompletions(data);

      expect(output).toContain("complete -c ggt -f");
      expect(output).toContain("complete -c ggt");
    });

    it("fish generator includes all non-hidden commands", () => {
      const output = generateFishCompletions(data);

      for (const cmd of data.commands) {
        expect(output).toContain(cmd.name);
      }
    });

    it("fish generator includes long flag aliases", () => {
      const output = generateFishCompletions(data);

      // --verbose has alias --debug, so fish output should include -l debug
      expect(output).toContain("-l debug");

      // --env on push/pull/deploy has aliases --environment, --from, --to
      expect(output).toContain("-l environment");
    });

    it("fish generator includes root flags in subcommand contexts", () => {
      const output = generateFishCompletions(data);

      // root flags like --verbose should appear in subcommand contexts (e.g. dev)
      const lines = output.split("\n");
      const devVerboseLine = lines.find((line) => line.includes("__fish_seen_subcommand_from dev") && line.includes("-l verbose"));
      expect(devVerboseLine).toBeDefined();
    });

    it("all generators include var subcommand flags", () => {
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

    it("bash output matches snapshot", () => {
      const output = generateBashCompletions(data);

      expect(output).toMatchSnapshot();
    });

    it("zsh output matches snapshot", () => {
      const output = generateZshCompletions(data);

      expect(output).toMatchSnapshot();
    });

    it("fish output matches snapshot", () => {
      const output = generateFishCompletions(data);

      expect(output).toMatchSnapshot();
    });

    describe("escape edge cases", () => {
      const makeSpecialCharData = (): CompletionData => ({
        rootFlags: [
          {
            name: "--test-flag",
            aliases: [],
            type: "boolean",
            description: "A flag: with [brackets] and 'quotes'",
          },
        ],
        commands: [
          {
            name: "test-cmd",
            description: "A colon: in description",
            flags: [
              {
                name: "--test-opt",
                aliases: [],
                type: "string",
                description: "Option [with]: special chars",
              },
            ],
            subcommands: [],
          },
        ],
      });

      it("zsh generator escapes colons in descriptions", () => {
        const output = generateZshCompletions(makeSpecialCharData());

        // the escaped form should be present
        expect(output).toContain("A colon\\: in description");

        // unescaped colons in _describe entries should not appear
        // _describe entries look like 'name:description' -- an unescaped colon
        // after the command name would break parsing
        const describeLines = output.split("\n").filter((l) => l.includes("'test-cmd:"));
        for (const line of describeLines) {
          expect(line).not.toMatch(/test-cmd:A colon: in description/);
        }
      });

      it("zsh generator escapes brackets and colons in flag descriptions", () => {
        const output = generateZshCompletions(makeSpecialCharData());

        expect(output).toContain("A flag\\: with \\[brackets\\] and");
      });

      it("fish generator escapes single quotes in descriptions", () => {
        const output = generateFishCompletions(makeSpecialCharData());

        // fish escapes single quotes by ending the quote, inserting an escaped
        // quote, and restarting: 'quotes' → '\\''quotes'\\''
        // The -d flag value for --test-flag should contain this pattern
        const lines = output.split("\n").filter((l) => l.includes("test-flag"));
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.some((l) => l.includes("'\\''quotes'\\''"))).toBe(true);
      });
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
    let data: CompletionData;

    beforeAll(async () => {
      data = await getCompletionData();
    });

    it("completion data covers all non-hidden registered commands", async () => {
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

    it("all commands have descriptions", () => {
      for (const cmd of data.commands) {
        expect(cmd.description, `command "${cmd.name}" has no description`).not.toBe("");
      }
    });

    it("all flags have descriptions", () => {
      for (const flag of data.rootFlags) {
        expect(flag.description, `root flag "${flag.name}" has no description`).not.toBe("");
      }

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
