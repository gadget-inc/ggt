import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

import fs from "fs-extra";
import type { MockInstance } from "vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import completion from "../../src/commands/completion.ts";
import dev from "../../src/commands/dev.ts";
import { usage } from "../../src/commands/root.ts";
import { AppArg, EnvArg } from "../../src/services/app/app.ts";
import { Commands, importCommand } from "../../src/services/command/command.ts";
import type { FlagDef } from "../../src/services/command/flag.ts";
import { generateBashCompletions } from "../../src/services/completion/bash.ts";
import { type CompletionData, getCompletionData } from "../../src/services/completion/completions.ts";
import { generateFishCompletions } from "../../src/services/completion/fish.ts";
import { handleCompletionRequest } from "../../src/services/completion/handler.ts";
import { generateZshCompletions } from "../../src/services/completion/zsh.ts";
import { nockTestApps, testApp } from "../__support__/app.ts";
import { testCtx } from "../__support__/context.ts";
import { mock } from "../__support__/mock.ts";
import { testDirPath } from "../__support__/paths.ts";
import { loginTestUser } from "../__support__/user.ts";

const execFileAsync = promisify(execFile);

const hasShell = (shell: string): boolean => {
  try {
    execFileSync("which", [shell], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

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

    it("includes --version root flag", () => {
      const versionFlag = data.rootFlags.find((f) => f.name === "--version");
      expect(versionFlag).toBeDefined();
      expect(versionFlag!.type).toBe("boolean");
    });

    it("excludes hidden aliases from root flags", () => {
      const verboseFlag = data.rootFlags.find((f) => f.name === "--verbose");
      expect(verboseFlag).toBeDefined();
      // --debug is a hidden alias of --verbose and must not appear
      expect(verboseFlag!.aliases).not.toContain("--debug");

      // also verify --debug doesn't appear as a standalone flag
      const debugFlag = data.rootFlags.find((f) => f.name === "--debug");
      expect(debugFlag).toBeUndefined();
    });

    it("extracts flag aliases", () => {
      const verboseFlag = data.rootFlags.find((f) => f.name === "--verbose");
      const helpFlag = data.rootFlags.find((f) => f.name === "--help");

      expect(verboseFlag?.aliases).toEqual(["-v"]);
      expect(helpFlag?.aliases).toEqual(["-h"]);
    });

    it("extracts command flags", () => {
      const push = data.commands.find((c) => c.name === "push");
      expect(push).toBeDefined();

      const appFlag = push!.flags.find((f) => f.name === "--application");
      const envFlag = push!.flags.find((f) => f.name === "--environment");
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
      expect(agentPlugin!.subcommands).toHaveLength(2);

      const names = agentPlugin!.subcommands.map((s) => s.name);
      expect(names).toEqual(["install", "update"]);

      expect(agentPlugin!.subcommands.find((s) => s.name === "install")!.flags.find((f) => f.name === "--force")).toBeDefined();
    });

    it("includes env subcommands", () => {
      const envCmd = data.commands.find((c) => c.name === "env");
      expect(envCmd).toBeDefined();
      expect(envCmd!.subcommands).toHaveLength(5);

      const names = envCmd!.subcommands.map((s) => s.name);
      expect(names).toEqual(["list", "create", "delete", "unpause", "use"]);
    });

    it("includes logs command aliases", () => {
      expect(data.commands.find((c) => c.name === "logs")!.aliases).toEqual(["log"]);
    });

    it("includes env command aliases", () => {
      expect(data.commands.find((c) => c.name === "env")!.aliases).toEqual(["envs"]);
    });

    it("includes env list subcommand aliases", () => {
      expect(data.commands.find((c) => c.name === "env")!.subcommands.find((s) => s.name === "list")!.aliases).toEqual(["ls"]);
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

    it("bash includes command aliases in word list and case pattern", () => {
      const bash = generateBashCompletions(data);

      // "log" should appear in the top-level compgen -W word list
      expect(bash).toMatch(/compgen -W ".*\blog\b.*"/);
      // case branch should contain logs|log or log|logs
      expect(bash).toMatch(/logs\|log\)|log\|logs\)/);
    });

    it("zsh includes command aliases in commands array and case dispatch", () => {
      const zsh = generateZshCompletions(data);

      // commands=(...) should contain 'log:...'
      expect(zsh).toContain("'log:");
      // case dispatch should contain logs|log or log|logs
      expect(zsh).toMatch(/logs\|log\)|log\|logs\)/);
    });

    it("fish includes command alias complete lines", () => {
      const fish = generateFishCompletions(data);

      expect(fish).toContain("complete -c ggt -n '__fish_use_subcommand' -a 'log'");
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
            aliases: [],
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
        // quote, and restarting: 'quotes' -> '\\''quotes'\\''
        // The -d flag value for --test-flag should contain this pattern
        const lines = output.split("\n").filter((l) => l.includes("test-flag"));
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.some((l) => l.includes("'\\''quotes'\\''"))).toBe(true);
      });
    });

    describe("flag name uniqueness", () => {
      it("has no conflicting flag names or aliases across scopes", async () => {
        const data = await getCompletionData();
        for (const cmd of data.commands) {
          // root flags + command flags should have unique names/aliases
          assertNoDuplicateFlags([...data.rootFlags, ...cmd.flags], `command "${cmd.name}"`);
          for (const sub of cmd.subcommands) {
            // root flags + command flags + subcommand flags should have unique names/aliases
            assertNoDuplicateFlags([...data.rootFlags, ...cmd.flags, ...sub.flags], `subcommand "${cmd.name} ${sub.name}"`);
          }
        }
      });
    });

    describe("file completion for path-valued flags", () => {
      const testData: CompletionData = {
        rootFlags: [{ name: "--help", type: "boolean", description: "Show help", aliases: ["-h"], hidden: false, hasCompleter: false }],
        commands: [
          {
            name: "test-cmd",
            description: "A test command",
            aliases: [],
            flags: [
              { name: "--app", type: "string", description: "App", aliases: ["-a"], hidden: false, hasCompleter: true },
              {
                name: "--from-file",
                type: "string",
                description: "Import from file",
                aliases: [],
                hidden: false,
                hasCompleter: false,
                valueName: "path",
              },
              { name: "--port", type: "number", description: "Port number", aliases: ["-p"], hidden: false, hasCompleter: false },
              { name: "--force", type: "boolean", description: "Force", aliases: ["-f"], hidden: false, hasCompleter: false },
            ],
            subcommands: [],
          },
        ],
      };

      it("bash uses compgen -f for path flags and suppresses other value flags", () => {
        const output = generateBashCompletions(testData);

        // path flags get file completion
        expect(output).toMatch(/--from-file\)\s*\n\s*COMPREPLY=\(\$\(compgen -f -- "\$cur"\)\)/);
        // non-path value flags get suppressed
        expect(output).toMatch(/--port\|-p\)\s*\n\s*return ;;/);
        // no blanket -o default
        expect(output).not.toContain("-o default");
      });

      it("zsh uses _files action for path flags", () => {
        const output = generateZshCompletions(testData);

        expect(output).toContain("--from-file[Import from file]:value:_files");
        expect(output).toMatch(/--port\[Port number\]:value: /);
      });

      it("fish uses -rF for path flags and -x for other value flags", () => {
        const output = generateFishCompletions(testData);

        // path flags get -rF (require arg, force file completion)
        expect(output).toMatch(/-l from-file.*-rF/);
        // non-path value flags get -x (require arg, no file completion)
        expect(output).toMatch(/-l port.*-x/);
      });

      it("fish disables file completions globally", () => {
        const output = generateFishCompletions(testData);
        expect(output).toContain("complete -c ggt -f");
      });
    });
  });

  describe("shell validation", () => {
    let data: CompletionData;

    const run = async (cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
      try {
        const { stdout, stderr } = await execFileAsync(cmd, args);
        return { stdout, stderr, exitCode: 0 };
      } catch (error: unknown) {
        const e = error as { stdout: string; stderr: string; code: number };
        return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.code ?? 1 };
      }
    };

    const writeCompletionFile = async (shell: string, content: string): Promise<string> => {
      const filePath = testDirPath(`ggt.${shell}`);
      await fs.writeFile(filePath, content);
      return filePath;
    };

    beforeAll(async () => {
      data = await getCompletionData();
    });

    describe.skipIf(!hasShell("bash"))("bash", () => {
      it("generates a syntactically valid script", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));

        const result = await run("bash", ["-n", scriptFile]);
        expect(result.exitCode, `bash syntax check failed:\n${result.stderr}`).toBe(0);
      });

      it("completes top-level commands", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));

        const result = await run("bash", [
          "-c",
          `
            source "${scriptFile}"
            COMP_WORDS=(ggt "")
            COMP_CWORD=1
            _ggt_completions
            printf '%s\\n' "\${COMPREPLY[@]}"
          `,
        ]);

        expect(result.exitCode, `bash completion failed:\n${result.stderr}`).toBe(0);

        const completions = result.stdout.split("\n").filter(Boolean);
        expect(completions).toContain("dev");
        expect(completions).toContain("deploy");
        expect(completions).toContain("completion");
      });

      it("completes flags for a command", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));

        const result = await run("bash", [
          "-c",
          `
            source "${scriptFile}"
            COMP_WORDS=(ggt dev "--")
            COMP_CWORD=2
            _ggt_completions
            printf '%s\\n' "\${COMPREPLY[@]}"
          `,
        ]);

        expect(result.exitCode, `bash flag completion failed:\n${result.stderr}`).toBe(0);

        const completions = result.stdout.split("\n").filter(Boolean);
        expect(completions).toContain("--app");
        expect(completions).toContain("--env");
      });

      it("completes subcommands for var", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));

        const result = await run("bash", [
          "-c",
          `
            source "${scriptFile}"
            COMP_WORDS=(ggt var "")
            COMP_CWORD=2
            _ggt_completions
            printf '%s\\n' "\${COMPREPLY[@]}"
          `,
        ]);

        expect(result.exitCode, `bash var subcommand completion failed:\n${result.stderr}`).toBe(0);

        const completions = result.stdout.split("\n").filter(Boolean);
        expect(completions).toContain("list");
        expect(completions).toContain("get");
        expect(completions).toContain("set");
        expect(completions).toContain("delete");
        expect(completions).toContain("import");
      });

      it("completes flags for a subcommand", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));

        const result = await run("bash", [
          "-c",
          `
            source "${scriptFile}"
            COMP_WORDS=(ggt var delete "--")
            COMP_CWORD=3
            _ggt_completions
            printf '%s\\n' "\${COMPREPLY[@]}"
          `,
        ]);

        expect(result.exitCode, `bash subcommand flag completion failed:\n${result.stderr}`).toBe(0);

        const completions = result.stdout.split("\n").filter(Boolean);
        expect(completions).toContain("--force");
        expect(completions).toContain("--all");
      });

      it("root flags included in command flag completion", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));
        const result = await run("bash", [
          "-c",
          `
            source "${scriptFile}"
            COMP_WORDS=(ggt dev "--")
            COMP_CWORD=2
            _ggt_completions
            printf '%s\\n' "\${COMPREPLY[@]}"
          `,
        ]);
        expect(result.exitCode, `bash root flag completion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout.split("\n").filter(Boolean);
        expect(completions).toContain("--help");
        expect(completions).toContain("--verbose");
        expect(completions).toContain("--app");
      });

      it("subcommand flags include parent and root flags", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));
        const result = await run("bash", [
          "-c",
          `
            source "${scriptFile}"
            COMP_WORDS=(ggt var delete "--")
            COMP_CWORD=3
            _ggt_completions
            printf '%s\\n' "\${COMPREPLY[@]}"
          `,
        ]);
        expect(result.exitCode, `bash subcommand flag completion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout.split("\n").filter(Boolean);
        expect(completions).toContain("--force");
        expect(completions).toContain("--all");
        expect(completions).toContain("--help");
        expect(completions).toContain("--verbose");
      });

      it("completes subcommand flags when value-taking flags precede the subcommand", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));
        const result = await run("bash", [
          "-c",
          `
            source "${scriptFile}"
            COMP_WORDS=(ggt var --app myapp delete "--")
            COMP_CWORD=5
            _ggt_completions
            printf '%s\\n' "\${COMPREPLY[@]}"
          `,
        ]);
        expect(result.exitCode, `bash subcommand flag completion with preceding flags failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout.split("\n").filter(Boolean);
        expect(completions).toContain("--force");
        expect(completions).toContain("--all");
      });

      it("completes subcommands when value-taking flags precede the subcommand position", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));
        const result = await run("bash", [
          "-c",
          `
            source "${scriptFile}"
            COMP_WORDS=(ggt var --app myapp "")
            COMP_CWORD=4
            _ggt_completions
            printf '%s\\n' "\${COMPREPLY[@]}"
          `,
        ]);
        expect(result.exitCode, `bash subcommand completion with preceding flags failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout.split("\n").filter(Boolean);
        expect(completions).toContain("list");
        expect(completions).toContain("get");
        expect(completions).toContain("set");
        expect(completions).toContain("delete");
      });

      it("uses complete -F without -o default or -o filenames", async () => {
        const scriptFile = await writeCompletionFile("bash", generateBashCompletions(data));
        const result = await run("bash", [
          "-c",
          `
            source "${scriptFile}"
            complete -p ggt
          `,
        ]);
        expect(result.exitCode, `bash complete -p failed:\n${result.stderr}`).toBe(0);
        expect(result.stdout).toContain("-F _ggt_completions ggt");
        expect(result.stdout).not.toContain("-o default");
        expect(result.stdout).not.toContain("-o filenames");
      });
    });

    describe.skipIf(!hasShell("zsh"))("zsh", () => {
      it("generates a syntactically valid script", async () => {
        const scriptFile = await writeCompletionFile("zsh", generateZshCompletions(data));

        const result = await run("zsh", ["-n", scriptFile]);
        expect(result.exitCode, `zsh syntax check failed:\n${result.stderr}`).toBe(0);
      });

      // Zsh programmatic completion testing outside an interactive shell is
      // unreliable. Instead, verify the generated script contains the expected
      // _describe entries and _arguments blocks.

      it("includes top-level commands in _describe entries", () => {
        const output = generateZshCompletions(data);

        // _describe uses 'name:description' pairs for command completion
        for (const cmd of ["dev", "deploy", "completion"]) {
          expect(output).toMatch(new RegExp(`'${cmd}:`));
        }
      });

      it("includes command-specific flags in _arguments blocks", () => {
        const output = generateZshCompletions(data);
        const lines = output.split("\n");

        // find the dev) case and verify it has --app and --env flags
        const devCaseIdx = lines.findIndex((l) => l.trim().startsWith("dev)"));
        expect(devCaseIdx).toBeGreaterThan(-1);

        const devBlock = lines.slice(devCaseIdx, lines.indexOf("          ;;", devCaseIdx) + 1).join("\n");
        expect(devBlock).toContain("--app");
        expect(devBlock).toContain("--env");
      });

      it("includes var subcommands in _describe entries", () => {
        const output = generateZshCompletions(data);

        for (const sub of ["list", "get", "set", "delete", "import"]) {
          expect(output).toMatch(new RegExp(`'${sub}:`));
        }
      });

      it("subcommand helpers exist for all parent commands", () => {
        const output = generateZshCompletions(data);
        for (const cmd of data.commands) {
          if (cmd.subcommands.length > 0) {
            const fnName = `_ggt_${cmd.name.replace(/-/g, "_")}`;
            expect(output, `missing helper function ${fnName}`).toContain(`${fnName}()`);
          }
        }
      });

      it("mutual exclusion groups exist for aliased flags", () => {
        const output = generateZshCompletions(data);
        for (const cmd of data.commands) {
          for (const flag of cmd.flags) {
            if (flag.aliases.length > 0) {
              const allNames = [flag.name, ...flag.aliases];
              const exclusionGroup = `(${allNames.join(" ")})`;
              expect(output, `missing exclusion group for ${flag.name}`).toContain(exclusionGroup);
            }
          }
        }
      });
    });

    describe.skipIf(!hasShell("fish"))("fish", () => {
      it("generates a syntactically valid script", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));

        const result = await run("fish", ["--no-execute", scriptFile]);
        expect(result.exitCode, `fish syntax check failed:\n${result.stderr}`).toBe(0);
      });

      it("completes top-level commands", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));

        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt '`]);

        expect(result.exitCode, `fish completion failed:\n${result.stderr}`).toBe(0);

        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).toContain("dev");
        expect(completions).toContain("deploy");
        expect(completions).toContain("completion");
      });

      it("completes subcommands for var", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));

        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt var '`]);

        expect(result.exitCode, `fish var subcommand completion failed:\n${result.stderr}`).toBe(0);

        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).toContain("list");
        expect(completions).toContain("get");
        expect(completions).toContain("set");
        expect(completions).toContain("delete");
        expect(completions).toContain("import");
      });

      it("completes flags for a command", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));

        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt dev --'`]);

        expect(result.exitCode, `fish flag completion failed:\n${result.stderr}`).toBe(0);

        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).toContain("--app");
        expect(completions).toContain("--env");
      });

      it("completes flags for a subcommand", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));

        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt var delete --'`]);

        expect(result.exitCode, `fish subcommand flag completion failed:\n${result.stderr}`).toBe(0);

        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).toContain("--force");
        expect(completions).toContain("--all");
      });

      it("short flag offers long form completions, not flag as value", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));
        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt dev -a'`]);
        expect(result.exitCode, `fish short flag completion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        // The dynamic completer for --app runs but ggt isn't available in test,
        // so we just verify -a isn't offered as a duplicate value candidate
        expect(completions).not.toContain("-a");
      });

      it("long flag prefix offers matching flags", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));
        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt dev --a'`]);
        expect(result.exitCode, `fish long flag prefix completion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).toContain("--app");
        expect(completions).toContain("--allow-unknown-directory");
      });

      it("no file completions after value-taking flag with space", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));
        const markerFile = testDirPath("should-not-appear.txt");
        await fs.writeFile(markerFile, "");
        const result = await run("fish", ["-c", `source '${scriptFile}'; cd '${testDirPath()}'; complete -C 'ggt dev --app '`]);
        expect(result.exitCode, `fish flag value completion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).not.toContain("should-not-appear.txt");
      });

      it("root flags available in command context", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));
        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt dev --h'`]);
        expect(result.exitCode, `fish root flag completion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).toContain("--help");
      });

      it("root flags available in subcommand context", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));
        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt var delete --h'`]);
        expect(result.exitCode, `fish subcommand root flag completion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).toContain("--help");
      });

      it("no commands offered after command is entered", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));
        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt dev '`]);
        expect(result.exitCode, `fish post-command completion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).not.toContain("deploy");
        expect(completions).not.toContain("push");
        expect(completions).not.toContain("pull");
      });

      it("subcommand completion excludes sibling subcommands", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));
        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt var delete '`]);
        expect(result.exitCode, `fish subcommand exclusion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        expect(completions).not.toContain("list");
        expect(completions).not.toContain("get");
        expect(completions).not.toContain("set");
        expect(completions).not.toContain("import");
      });

      it("flag with = syntax does not error", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));
        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt dev --app='`]);
        expect(result.exitCode, `fish = syntax failed:\n${result.stderr}`).toBe(0);
      });

      it("-v offers verbose or version flags", async () => {
        const scriptFile = await writeCompletionFile("fish", generateFishCompletions(data));
        const result = await run("fish", ["-c", `source '${scriptFile}'; complete -C 'ggt -v'`]);
        expect(result.exitCode, `fish -v completion failed:\n${result.stderr}`).toBe(0);
        const completions = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[0]!);
        // Should offer long forms like --verbose or --version, not -v as a value
        expect(completions.some((c) => c === "--verbose" || c === "--version")).toBe(true);
      });
    });
  });

  describe("command", () => {
    let writeSpy: MockInstance;

    beforeEach(() => {
      writeSpy = mock(process.stdout, "write", () => true);
    });

    it("outputs bash completions", async () => {
      await completion.subcommands.bash.run(testCtx, { _: [] } as never);

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy.mock.calls[0]![0]).toContain("_ggt_completions");
    });

    it("outputs zsh completions", async () => {
      await completion.subcommands.zsh.run(testCtx, { _: [] } as never);

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy.mock.calls[0]![0]).toContain("#compdef ggt");
    });

    it("outputs fish completions", async () => {
      await completion.subcommands.fish.run(testCtx, { _: [] } as never);

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy.mock.calls[0]![0]).toContain("complete -c ggt");
    });
  });

  describe("handleCompletionRequest", () => {
    let writeSpy: MockInstance;

    beforeEach(() => {
      writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    });

    afterEach(() => {
      writeSpy.mockRestore();
    });

    const getOutput = (): string => writeSpy.mock.calls.map((c) => String(c[0])).join("");

    it("completes command names when no command given", async () => {
      await handleCompletionRequest(testCtx, [""]);
      const output = getOutput();
      expect(output).toContain("dev\n");
      expect(output).toContain("deploy\n");
      expect(output).toContain("push\n");
    });

    it("excludes hidden commands from completion candidates", async () => {
      const origImport = importCommand;
      const { mock: mockFn, mockRestore: restoreFn } = await import("../__support__/mock.ts");
      const commandModule = await import("../../src/services/command/command.ts");

      mockFn(commandModule, "importCommand", async (...args: Parameters<typeof origImport>) => {
        const result = await origImport(...args);
        if (args[0] === "version") {
          return { ...result, hidden: true };
        }
        return result;
      });

      try {
        await handleCompletionRequest(testCtx, [""]);
        const output = getOutput();
        const lines = output.split("\n");
        expect(lines).not.toContain("version");
        expect(lines).toContain("dev");
      } finally {
        restoreFn(commandModule.importCommand);
      }
    });

    it("completes command names with partial match", async () => {
      await handleCompletionRequest(testCtx, ["de"]);
      const output = getOutput();
      expect(output).toContain("dev\n");
      expect(output).toContain("deploy\n");
      expect(output).not.toContain("push\n");
    });

    it("completes flag names for a command", async () => {
      await handleCompletionRequest(testCtx, ["dev", "--"]);
      const output = getOutput();
      expect(output).toContain("--app\n");
      expect(output).toContain("--env\n");
      expect(output).toContain("--prefer\n");
    });

    it("completes subcommand names", async () => {
      await handleCompletionRequest(testCtx, ["var", ""]);
      const output = getOutput();
      expect(output).toContain("list\n");
      expect(output).toContain("get\n");
      expect(output).toContain("set\n");
      expect(output).toContain("delete\n");
      expect(output).toContain("import\n");
    });

    it("completes flag names for a subcommand", async () => {
      await handleCompletionRequest(testCtx, ["var", "delete", "--"]);
      const output = getOutput();
      expect(output).toContain("--force\n");
      expect(output).toContain("--all\n");
    });

    it("returns empty for unknown command", async () => {
      await handleCompletionRequest(testCtx, ["nonexistent", ""]);
      const output = getOutput();
      expect(output).toBe("");
    });

    it("completes flags for a command alias", async () => {
      // "log" is an alias for "logs"
      await handleCompletionRequest(testCtx, ["log", "--"]);
      const output = getOutput();
      expect(output).toContain("--app\n");
      expect(output).toContain("--env\n");
    });

    it("completes subcommands for a command alias", async () => {
      // "envs" is an alias for "env"
      await handleCompletionRequest(testCtx, ["envs", ""]);
      const output = getOutput();
      expect(output).toContain("list\n");
    });

    it("completes flags for a subcommand alias", async () => {
      // "ls" is an alias for "list" under the "env" command
      await handleCompletionRequest(testCtx, ["env", "ls", "--"]);
      const output = getOutput();
      // should get flags from the "list" subcommand
      expect(output).toContain("--help\n");
    });

    describe("with auth and apps", () => {
      beforeEach(() => {
        loginTestUser();
        nockTestApps();
      });

      it("completes app values via provider", async () => {
        await handleCompletionRequest(testCtx, ["dev", "--app", ""]);
        const output = getOutput();
        expect(output).toContain("test\n");
        expect(output).toContain("test2\n");
      });

      it("completes environment values via provider", async () => {
        await handleCompletionRequest(testCtx, ["dev", "--app", "test", "--env", ""]);
        const output = getOutput();
        expect(output).toContain("development\n");
        expect(output).toContain("production\n");
      });

      it("completes flag values via short alias", async () => {
        await handleCompletionRequest(testCtx, ["dev", "-a", ""]);
        const output = getOutput();
        expect(output).toContain("test\n");
        expect(output).toContain("test2\n");
      });

      it("completes flag values via long alias", async () => {
        await handleCompletionRequest(testCtx, ["dev", "--application", ""]);
        const output = getOutput();
        expect(output).toContain("test\n");
        expect(output).toContain("test2\n");
      });

      it("handles --flag=value without consuming the next token", async () => {
        await handleCompletionRequest(testCtx, ["dev", "--app=test", "--env", ""]);
        const output = getOutput();
        expect(output).toContain("development\n");
        expect(output).toContain("production\n");
      });
    });

    it("completes --prefer values", async () => {
      await handleCompletionRequest(testCtx, ["dev", "--prefer", ""]);
      const output = getOutput();
      expect(output).toContain("local\n");
      expect(output).toContain("environment\n");
    });

    it("completes --prefer values with partial", async () => {
      await handleCompletionRequest(testCtx, ["dev", "--prefer", "l"]);
      const output = getOutput();
      expect(output).toContain("local\n");
      expect(output).not.toContain("environment\n");
    });

    it("includes root flags when completing command flags", async () => {
      await handleCompletionRequest(testCtx, ["dev", "--"]);
      const output = getOutput();
      expect(output).toContain("--help\n");
      expect(output).toContain("--verbose\n");
      expect(output).toContain("--app\n");
    });

    it("returns empty for boolean flag as prev token", async () => {
      await handleCompletionRequest(testCtx, ["dev", "--force", ""]);
      const output = getOutput();
      // --force is boolean, so handler should not try to complete a value
      // and should fall through to flag name completion
      expect(output).not.toBe("");
      expect(output).toContain("--app\n");
    });

    it("returns empty for unknown flag as prev token", async () => {
      await handleCompletionRequest(testCtx, ["dev", "--nonexistent", ""]);
      const output = getOutput();
      // unknown flag falls through to flag name completion
      expect(output).toContain("--app\n");
    });

    it("returns empty for string flag with no completer", async () => {
      // --from-file on var import is a string flag without a completer
      await handleCompletionRequest(testCtx, ["var", "import", "--from-file", ""]);
      const output = getOutput();
      expect(output).toBe("");
    });

    it("does not treat --flag=value as a flag expecting a value argument", async () => {
      // When --force=anything appears (even though --force is boolean),
      // the = means the value is inline, so the next token is NOT consumed
      await handleCompletionRequest(testCtx, ["dev", "--force=1", ""]);
      const output = getOutput();
      // should fall through to flag completion, not treat "" as a flag value
      expect(output).toContain("--app\n");
    });

    it("completes subcommand-specific flag values", async () => {
      loginTestUser();
      nockTestApps();
      // --app on var set is resolved through the subcommand args path
      await handleCompletionRequest(testCtx, ["var", "set", "--app", ""]);
      const output = getOutput();
      expect(output).toContain("test\n");
    });

    it("skips flag values when detecting subcommand", async () => {
      loginTestUser();
      nockTestApps();
      // --app takes a value ("myapp"), so "delete" is the subcommand, not "myapp"
      await handleCompletionRequest(testCtx, ["var", "--app", "myapp", "delete", "--"]);
      const output = getOutput();
      expect(output).toContain("--force\n");
      expect(output).toContain("--all\n");
    });

    it("skips flag values with short alias when detecting subcommand", async () => {
      loginTestUser();
      nockTestApps();
      // -a is an alias for --app, which takes a value
      await handleCompletionRequest(testCtx, ["var", "-a", "myapp", "delete", "--"]);
      const output = getOutput();
      expect(output).toContain("--force\n");
      expect(output).toContain("--all\n");
    });

    it("does not skip tokens after boolean flags when detecting subcommand", async () => {
      // --help is boolean, so "delete" right after it is a subcommand
      await handleCompletionRequest(testCtx, ["var", "--help", "delete", "--"]);
      const output = getOutput();
      expect(output).toContain("--force\n");
      expect(output).toContain("--all\n");
    });

    it("skips flag values when detecting command name", async () => {
      // --json is boolean (should not skip), but test with a root string flag if any
      // Root args are all boolean/count, so this tests that boolean flags don't skip
      await handleCompletionRequest(testCtx, ["--help", "var", ""]);
      const output = getOutput();
      expect(output).toContain("list\n");
      expect(output).toContain("delete\n");
    });

    it("silently returns empty on error", async () => {
      // no auth set up, so getApplications will fail
      await handleCompletionRequest(testCtx, ["dev", "--app", ""]);
      const output = getOutput();
      expect(output).toBe("");
    });

    it("does not throw when tokens contain an unknown flag", async () => {
      await handleCompletionRequest(testCtx, ["dev", "--totally-unknown-flag", ""]);
      const output = getOutput();
      // should still complete flags for the dev command
      expect(output).toContain("--app\n");
    });
  });

  describe("providers", () => {
    describe("dev --prefer complete", () => {
      it("returns all values with empty partial", async () => {
        const result = await dev.flags["--prefer"].complete!(testCtx, "", []);
        expect(result).toEqual(["local", "environment"]);
      });

      it("filters by prefix", async () => {
        const result = await dev.flags["--prefer"].complete!(testCtx, "l", []);
        expect(result).toEqual(["local"]);
      });
    });

    describe("AppArg.complete", () => {
      beforeEach(() => {
        loginTestUser();
        nockTestApps();
      });

      it("returns all app slugs with empty partial", async () => {
        const result = await AppArg.complete(testCtx, "", []);
        expect(result).toEqual(["test", "test2"]);
      });

      it("filters by prefix", async () => {
        const result = await AppArg.complete(testCtx, "test2", []);
        expect(result).toEqual(["test2"]);
      });
    });

    describe("AppArg.complete without auth", () => {
      it("returns empty when not logged in", async () => {
        const result = await AppArg.complete(testCtx, "", []);
        expect(result).toEqual([]);
      });
    });

    describe("EnvArg.complete", () => {
      beforeEach(() => {
        loginTestUser();
        nockTestApps();
      });

      it("returns environment names for a specific app", async () => {
        const result = await EnvArg.complete(testCtx, "", ["--app", "test"]);
        expect(result).toEqual(testApp.environments.map((e) => e.name));
      });

      it("filters by prefix", async () => {
        const result = await EnvArg.complete(testCtx, "dev", ["--app", "test"]);
        expect(result).toEqual(["development"]);
      });

      it("returns deduplicated env names when no --app given", async () => {
        const result = await EnvArg.complete(testCtx, "", []);
        expect(result.length).toBeGreaterThan(0);
        // should be deduplicated
        expect(result).toEqual([...new Set(result)]);
      });

      it("resolves app from --app=value syntax", async () => {
        const result = await EnvArg.complete(testCtx, "", ["--app=test"]);
        expect(result).toEqual(testApp.environments.map((e) => e.name));
      });

      it("resolves app from sync.json when no --app given", async () => {
        const syncJson = JSON.stringify({
          application: "test",
          environment: "development",
          environments: { development: { filesVersion: "1" } },
        });
        const gadgetDir = testDirPath(".gadget");
        await fs.ensureDir(gadgetDir);
        await fs.writeFile(testDirPath(".gadget/sync.json"), syncJson);

        // chdir so findUp can locate sync.json
        const originalCwd = process.cwd();
        process.chdir(testDirPath());
        try {
          const result = await EnvArg.complete(testCtx, "", []);
          expect(result).toEqual(testApp.environments.map((e) => e.name));
        } finally {
          process.chdir(originalCwd);
        }
      });
    });

    describe("EnvArg.complete without auth", () => {
      it("returns empty when not logged in", async () => {
        const result = await EnvArg.complete(testCtx, "", ["--app", "test"]);
        expect(result).toEqual([]);
      });
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

        const expectedNames = Object.keys("subcommands" in mod && mod.subcommands ? mod.subcommands : {});
        const actualNames = def!.subcommands.map((s) => s.name);
        expect(actualNames, `subcommand mismatch for "${cmd}"`).toEqual(expectedNames);
      }
    });
  });
});

const assertNoDuplicateFlags = (flags: FlagDef[], context: string): void => {
  const seen = new Map<string, string>(); // alias -> owner flag name
  for (const flag of flags) {
    for (const name of [flag.name, ...flag.aliases]) {
      const owner = seen.get(name);
      if (owner) {
        throw new Error(`Duplicate flag "${name}" in ${context}: claimed by both "${owner}" and "${flag.name}"`);
      }
      seen.set(name, flag.name);
    }
  }
};
