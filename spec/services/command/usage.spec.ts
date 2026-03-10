import { describe, expect, it } from "vitest";

import type { FlagDef } from "../../../src/services/command/arg.js";
import { Commands, importCommand, renderCommandList } from "../../../src/services/command/command.js";
import {
  flagLeft,
  formatFlag,
  hasDetailedContent,
  renderDetailedUsage,
  renderShortUsage,
  renderUsageHint,
  type UsageInput,
} from "../../../src/services/command/usage.js";
import { noop } from "../../../src/services/util/function.js";

describe("formatFlag", () => {
  it("formats a flag with aliases", () => {
    const flag: FlagDef = { name: "--app", aliases: ["-a"], type: "string", description: "Select the application" };
    expect(formatFlag(flag)).toBe("  -a, --app <value>       Select the application");
  });

  it("formats a flag with a custom valueName", () => {
    const flag: FlagDef = { name: "--app", aliases: ["-a"], type: "string", description: "Select the application", valueName: "name" };
    expect(formatFlag(flag)).toBe("  -a, --app <name>        Select the application");
  });

  it("formats a boolean flag without value placeholder", () => {
    const flag: FlagDef = { name: "--force", aliases: ["-f"], type: "boolean", description: "Force the operation" };
    expect(formatFlag(flag)).toBe("  -f, --force             Force the operation");
  });

  it("formats a flag without aliases", () => {
    const flag: FlagDef = { name: "--telemetry", aliases: [], type: "boolean", description: "Enable telemetry" };
    expect(formatFlag(flag)).toBe("      --telemetry         Enable telemetry");
  });

  it("formats a count flag without value placeholder", () => {
    const flag: FlagDef = { name: "--verbose", aliases: ["-v"], type: "count", description: "Print more verbose output" };
    expect(formatFlag(flag)).toBe("  -v, --verbose           Print more verbose output");
  });
});

describe("flagLeft", () => {
  it("does not include short flag name in longAliases", () => {
    const flag: FlagDef = { name: "-v", aliases: ["--verbose"], type: "count", description: "Verbose" };
    const result = flagLeft(flag);
    // -v should be in the short column (no leading spaces), not the long column
    expect(result).toBe("-v, --verbose");
  });

  it("sorts prefix-family long flags by length, then rest", () => {
    const flag: FlagDef = {
      name: "--environment",
      aliases: ["-e", "--to", "--env"],
      type: "string",
      description: "Select the environment",
    };
    expect(flagLeft(flag)).toBe("-e, --env, --environment, --to <value>");
  });

  it("puts canonical first when no alias shares its prefix", () => {
    const flag: FlagDef = { name: "--allow-problems", aliases: ["--allow-issues"], type: "boolean", description: "Allow problems" };
    expect(flagLeft(flag)).toBe("    --allow-problems, --allow-issues");
  });
});

describe("renderShortUsage", () => {
  it("renders a minimal command with just a description", () => {
    const mod: UsageInput = {
      description: "Print this version of ggt",
    };

    const output = renderShortUsage("version", mod);

    expect(output).toMatchInlineSnapshot(`
      "Print this version of ggt

      USAGE
        ggt version"
    `);
  });

  it("shows footer when command has detailed content", () => {
    const mod: UsageInput = {
      description: "Test command",
      details: "Some detailed info",
    };

    const output = renderShortUsage("test", mod);

    expect(output).toMatchInlineSnapshot(`
      "Test command

      USAGE
        ggt test

      Run ggt test --help for more information."
    `);
  });

  it("shows footer when a flag has details", () => {
    const mod: UsageInput = {
      description: "Test command",
      args: {
        "--flag": {
          type: Boolean,
          description: "A flag",
          details: "Detailed flag description",
        },
      },
    };

    const output = renderShortUsage("test", mod);

    expect(output).toMatchInlineSnapshot(`
      "Test command

      USAGE
        ggt test [flags]

      FLAGS
            --flag              A flag

      Run ggt test --help for more information."
    `);
  });

  it("does not show footer when flags have no details", () => {
    const mod: UsageInput = {
      description: "Push your local files",
      args: {
        "--app": { type: String, alias: "-a", description: "Select the application" },
        "--force": { type: Boolean, alias: "-f", description: "Force the operation" },
      },
    };

    const output = renderShortUsage("push", mod);

    expect(output).toMatchInlineSnapshot(`
      "Push your local files

      USAGE
        ggt push [flags]

      FLAGS
        -a, --app <value>       Select the application
        -f, --force             Force the operation"
    `);
  });

  it("renders subcommands in a COMMANDS section", () => {
    const mod: UsageInput = {
      description: "Generate shell completions",
      subcommands: {
        bash: { description: "Generate Bash completions", run: noop },
        zsh: { description: "Generate Zsh completions", run: noop },
        fish: { description: "Generate Fish completions", run: noop },
      },
    };

    const output = renderShortUsage("completion", mod);

    expect(output).toMatchInlineSnapshot(`
      "Generate shell completions

      USAGE
        ggt completion <command>

      COMMANDS
        bash    Generate Bash completions
        zsh     Generate Zsh completions
        fish    Generate Fish completions"
    `);
  });

  it("renders examples with plain $ prefix", () => {
    const mod: UsageInput = {
      description: "Start developing",
      examples: ["ggt dev ~/myApp --app myBlog", "ggt dev --env main --prefer local"],
    };

    const output = renderShortUsage("dev", mod);

    expect(output).toMatchInlineSnapshot(`
      "Start developing

      USAGE
        ggt dev

      EXAMPLES
        $ ggt dev ~/myApp --app myBlog
        $ ggt dev --env main --prefer local"
    `);
  });

  it("renders a positional argument in the usage line", () => {
    const mod: UsageInput = {
      description: "Start developing",
      positionals: [{ name: "DIRECTORY", description: "The directory to sync", placeholder: "[DIRECTORY]" }],
      args: {
        "--force": { type: Boolean, description: "Force the operation" },
      },
    };

    const output = renderShortUsage("dev", mod);

    expect(output).toMatchInlineSnapshot(`
      "Start developing

      USAGE
        ggt dev [DIRECTORY] [flags]

      ARGUMENTS
        DIRECTORY    The directory to sync

      FLAGS
            --force             Force the operation"
    `);
  });

  it("omits [flags] when there are no flags", () => {
    const mod: UsageInput = {
      description: "Simple command",
    };

    const output = renderShortUsage("test", mod);

    expect(output).toMatchInlineSnapshot(`
      "Simple command

      USAGE
        ggt test"
    `);
  });

  it("renders an ARGUMENTS section for positionals", () => {
    const mod: UsageInput = {
      description: "Start developing",
      positionals: [{ name: "DIRECTORY", description: 'The local directory to sync files to (default: ".")', placeholder: "[DIRECTORY]" }],
      args: {
        "--force": { type: Boolean, description: "Force the operation" },
      },
    };

    const output = renderShortUsage("dev", mod);

    expect(output).toMatchInlineSnapshot(`
      "Start developing

      USAGE
        ggt dev [DIRECTORY] [flags]

      ARGUMENTS
        DIRECTORY    The local directory to sync files to (default: ".")

      FLAGS
            --force             Force the operation"
    `);
  });

  it("renders a comprehensive command", () => {
    const mod: UsageInput = {
      description: "Start developing your application",
      positionals: [{ name: "DIRECTORY", description: 'The local directory to sync files to (default: ".")', placeholder: "[DIRECTORY]" }],
      args: {
        "--app": { type: String, alias: "-a", description: "Select the application", valueName: "name" },
        "--env": { type: String, alias: "-e", description: "Select the environment", valueName: "environment" },
        "--force": { type: Boolean, description: "Force the operation" },
      },
      examples: ["ggt dev ~/myApp --app myBlog"],
    };

    const output = renderShortUsage("dev", mod);

    expect(output).toMatchInlineSnapshot(`
      "Start developing your application

      USAGE
        ggt dev [DIRECTORY] [flags]

      ARGUMENTS
        DIRECTORY    The local directory to sync files to (default: ".")

      FLAGS
        -a, --app <name>         Select the application
        -e, --env <environment>  Select the environment
            --force              Force the operation

      EXAMPLES
        $ ggt dev ~/myApp --app myBlog"
    `);
  });

  it("hides brief: false flags from the FLAGS section", () => {
    const mod: UsageInput = {
      description: "Test command",
      args: {
        "--visible": { type: Boolean, description: "A visible flag" },
        "--advanced": { type: Boolean, description: "An advanced flag", brief: false },
      },
    };

    const output = renderShortUsage("test", mod);

    expect(output).toMatchInlineSnapshot(`
      "Test command

      USAGE
        ggt test [flags]

      FLAGS
            --visible           A visible flag

      Run ggt test --help for more information."
    `);
  });

  it("still shows [flags] suffix when only brief: false flags exist", () => {
    const mod: UsageInput = {
      description: "Test command",
      args: {
        "--advanced": { type: Boolean, description: "An advanced flag", brief: false },
      },
    };

    const output = renderShortUsage("test", mod);

    expect(output).toMatchInlineSnapshot(`
      "Test command

      USAGE
        ggt test [flags]

      Run ggt test --help for more information."
    `);
  });

  it("shows footer when brief: false flags exist", () => {
    const mod: UsageInput = {
      description: "Test command",
      args: {
        "--visible": { type: Boolean, description: "A visible flag" },
        "--advanced": { type: Boolean, description: "An advanced flag", brief: false },
      },
    };

    const output = renderShortUsage("test", mod);

    expect(output).toContain("Run ggt test --help for more information.");
  });

  it("does not show footer when only hidden flags have details", () => {
    const mod: UsageInput = {
      description: "Test command",
      args: {
        "--visible": { type: Boolean, description: "A visible flag" },
        "--secret": { type: Boolean, description: "A hidden flag", details: "Hidden details", hidden: true },
      },
    };

    const output = renderShortUsage("test", mod);

    expect(output).not.toContain("--help");
  });

  it("escapes braces in command names", () => {
    const mod: UsageInput = {
      description: "Desc",
    };

    const output = renderShortUsage("cmd{name}", mod);

    expect(output).toContain("ggt cmd{name}");
  });
});

describe("renderDetailedUsage", () => {
  it("produces short usage without footer when no extra metadata exists", () => {
    const mod: UsageInput = {
      description: "Print this version of ggt",
    };

    expect(renderDetailedUsage("version", mod)).toMatchInlineSnapshot(`
      "Print this version of ggt

      USAGE
        ggt version"
    `);
  });

  it("does not contain a circular --help footer when falling back for a command without detailed content", () => {
    const mod: UsageInput = {
      description: "List your available applications",
    };

    const output = renderDetailedUsage("list", mod);

    expect(output).not.toContain('--help" for more information');
  });

  it("includes detail below the description", () => {
    const mod: UsageInput = {
      description: "Push your local files",
      details: "Pushes your local files to your environment directory.\n\nChanges are tracked since last sync.",
    };

    const output = renderDetailedUsage("push", mod);

    expect(output).toMatchInlineSnapshot(`
      "Push your local files

      Pushes your local files to your environment directory.

      Changes are tracked since last sync.

      USAGE
        ggt push"
    `);
  });

  it("renders sections with uppercase title and content", () => {
    const mod: UsageInput = {
      description: "Start developing",
      sections: [
        { title: "Ignoring files", content: "Use .ignore to exclude files." },
        { title: "Notes", content: "Only works with development environments." },
      ],
    };

    const output = renderDetailedUsage("dev", mod);

    expect(output).toMatchInlineSnapshot(`
      "Start developing

      USAGE
        ggt dev

      IGNORING FILES
        Use .ignore to exclude files.

      NOTES
        Only works with development environments."
    `);
  });

  it("renders expanded flag format when a flag has details", () => {
    const mod: UsageInput = {
      description: "Start developing",
      args: {
        "--prefer": {
          type: String,
          description: "Conflict resolution preference",
          details: "When conflicts are detected, use this preference\nto automatically resolve them.",
        },
        "--force": { type: Boolean, description: "Force the operation" },
      },
    };

    const output = renderDetailedUsage("dev", mod);

    expect(output).toMatchInlineSnapshot(`
      "Start developing

      USAGE
        ggt dev [flags]

      FLAGS
            --force
              Force the operation

            --prefer <value>
              Conflict resolution preference. When conflicts are detected, use this
              preference to automatically resolve them."
    `);
  });

  it("renders expanded positionals with details", () => {
    const mod: UsageInput = {
      description: "Start developing",
      positionals: [
        {
          name: "DIRECTORY",
          description: "Sync directory",
          details: "The local directory to sync files to. Defaults to the current working directory.",
          placeholder: "[DIRECTORY]",
        },
      ],
    };

    const output = renderDetailedUsage("dev", mod);

    expect(output).toMatchInlineSnapshot(`
      "Start developing

      USAGE
        ggt dev [DIRECTORY]

      ARGUMENTS
        DIRECTORY
              Sync directory. The local directory to sync files to. Defaults to the
              current working directory."
    `);
  });

  it("omits hidden flags from output", () => {
    const mod: UsageInput = {
      description: "Start developing",
      details: "Some detail to trigger detailed usage path.",
      args: {
        "--prefer": {
          type: String,
          description: "Conflict resolution preference",
          details: "When conflicts are detected, use this preference.",
        },
        "--file-push-delay": {
          type: Number,
          description: "Internal push delay",
          hidden: true,
        },
      },
    };

    const output = renderDetailedUsage("dev", mod);

    expect(output).toMatchInlineSnapshot(`
      "Start developing

      Some detail to trigger detailed usage path.

      USAGE
        ggt dev [flags]

      FLAGS
            --prefer <value>
              Conflict resolution preference. When conflicts are detected, use this
              preference."
    `);
  });

  it("renders detail, sections, and expanded flags together", () => {
    const mod: UsageInput = {
      description: "Start developing your application",
      details: "Watches your local files and syncs them to your Gadget environment.\n\nChanges are tracked since last sync.",
      args: {
        "--prefer": {
          type: String,
          description: "Conflict resolution preference",
          details: "When conflicts are detected, use this preference\nto automatically resolve them.",
        },
        "--force": { type: Boolean, description: "Force the operation" },
      },
      sections: [{ title: "Ignoring files", content: "Use .ignore to exclude files from syncing." }],
    };

    const output = renderDetailedUsage("dev", mod);

    expect(output).toMatchInlineSnapshot(`
      "Start developing your application

      Watches your local files and syncs them to your Gadget environment.

      Changes are tracked since last sync.

      USAGE
        ggt dev [flags]

      FLAGS
            --force
              Force the operation

            --prefer <value>
              Conflict resolution preference. When conflicts are detected, use this
              preference to automatically resolve them.

      IGNORING FILES
        Use .ignore to exclude files from syncing."
    `);
  });

  it("renders FLAGS and ADDITIONAL FLAGS sections separately", () => {
    const mod: UsageInput = {
      description: "Deploy an environment",
      details: "Deploys to production.",
      args: {
        "--force": { type: Boolean, alias: "-f", description: "Force the operation", details: "Skips all prompts." },
        "--allow-problems": {
          type: Boolean,
          description: "Allow deploying with problems",
          brief: false,
          details: "Deploys even with errors.",
        },
        "--allow-charges": {
          type: Boolean,
          description: "Allow deploying with new charges",
          brief: false,
          details: "Skips billing prompt.",
        },
      },
    };

    const output = renderDetailedUsage("deploy", mod);

    expect(output).toMatchInlineSnapshot(`
      "Deploy an environment

      Deploys to production.

      USAGE
        ggt deploy [flags]

      FLAGS
        -f, --force
              Force the operation. Skips all prompts.

      ADDITIONAL FLAGS
            --allow-charges
              Allow deploying with new charges. Skips billing prompt.

            --allow-problems
              Allow deploying with problems. Deploys even with errors."
    `);
  });

  it("preserves blank lines between paragraphs in flag details", () => {
    const mod: UsageInput = {
      description: "Desc",
      args: {
        "--flag": {
          type: Boolean,
          description: "A flag",
          details: "First paragraph.\n\nSecond paragraph.",
        },
      },
    };

    const output = renderDetailedUsage("test", mod);

    expect(output).toMatchInlineSnapshot(`
      "Desc

      USAGE
        ggt test [flags]

      FLAGS
            --flag
              A flag. First paragraph.

              Second paragraph."
    `);
  });
});

describe("renderUsageHint", () => {
  it("produces a USAGE header, usage line, and -h pointer", () => {
    const mod: UsageInput = {
      description: "Push your local files",
      positionals: [{ name: "path", required: true, description: "Target path" }],
      args: {
        "--force": { type: Boolean, alias: "-f", description: "Force the operation" },
      },
    };

    const output = renderUsageHint("push", mod);

    expect(output).toMatchInlineSnapshot(`
      "USAGE
        ggt push <path> [flags]

      Run ggt push -h for more information."
    `);
  });

  it("renders without [flags] when command has no flags", () => {
    const mod: UsageInput = {
      description: "Simple command",
    };

    const output = renderUsageHint("simple", mod);

    expect(output).toMatchInlineSnapshot(`
      "USAGE
        ggt simple

      Run ggt simple -h for more information."
    `);
  });

  it("renders subcommand slot for parent commands", () => {
    const mod: UsageInput = {
      description: "Parent command",
      subcommands: {
        list: { description: "List items", run: noop },
      },
    };

    const output = renderUsageHint("test", mod);

    expect(output).toMatchInlineSnapshot(`
      "USAGE
        ggt test <command>

      Run ggt test -h for more information."
    `);
  });
});

describe("flag sorting", () => {
  it("sorts short-alias flags before long-only flags", () => {
    const mod: UsageInput = {
      description: "Deploy an environment",
      args: {
        "--allow-different-app": { type: Boolean, description: "Allow different app" },
        "--allow-unknown-directory": { type: Boolean, description: "Allow unknown directory" },
        "--force": { type: Boolean, alias: "-f", description: "Force the deploy" },
      },
    };

    const output = renderShortUsage("deploy", mod);

    // -f, --force should appear before the long-only flags
    const flagsSection = output.split("FLAGS")[1]!;
    const forceIndex = flagsSection.indexOf("--force");
    const allowDiffIndex = flagsSection.indexOf("--allow-different-app");
    expect(forceIndex).toBeLessThan(allowDiffIndex);
  });

  it("sorts flags with short aliases by alias letter", () => {
    const mod: UsageInput = {
      description: "Test command",
      args: {
        "--force": { type: Boolean, alias: "-f", description: "Force" },
        "--app": { type: String, alias: "-a", description: "App" },
        "--env": { type: String, alias: "-e", description: "Env" },
      },
    };

    const output = renderShortUsage("test", mod);

    const flagsSection = output.split("FLAGS")[1]!;
    const appIdx = flagsSection.indexOf("--app");
    const envIdx = flagsSection.indexOf("--env");
    const forceIdx = flagsSection.indexOf("--force");
    expect(appIdx).toBeLessThan(envIdx);
    expect(envIdx).toBeLessThan(forceIdx);
  });

  it("sorts long-only flags alphabetically", () => {
    const mod: UsageInput = {
      description: "Test command",
      args: {
        "--zebra": { type: Boolean, description: "Zebra" },
        "--alpha": { type: Boolean, description: "Alpha" },
        "--middle": { type: Boolean, description: "Middle" },
      },
    };

    const output = renderShortUsage("test", mod);

    const flagsSection = output.split("FLAGS")[1]!;
    const alphaIdx = flagsSection.indexOf("--alpha");
    const middleIdx = flagsSection.indexOf("--middle");
    const zebraIdx = flagsSection.indexOf("--zebra");
    expect(alphaIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(zebraIdx);
  });

  it("applies same sort order in detailed usage", () => {
    const mod: UsageInput = {
      description: "Test command",
      args: {
        "--allow-different-app": { type: Boolean, description: "Allow different app" },
        "--force": { type: Boolean, alias: "-f", description: "Force", details: "Force details." },
      },
    };

    const output = renderDetailedUsage("test", mod);

    const flagsSection = output.split("FLAGS")[1]!;
    const forceIdx = flagsSection.indexOf("--force");
    const allowIdx = flagsSection.indexOf("--allow-different-app");
    expect(forceIdx).toBeLessThan(allowIdx);
  });
});

describe("renderCommandList", () => {
  it("returns a string containing non-hidden command names", async () => {
    const output = await renderCommandList();

    expect(output).toContain("dev");
    expect(output).toContain("deploy");
    expect(output).toContain("push");
    expect(output).toContain("pull");
    expect(output).toContain("login");
    expect(output).toContain("logout");
    expect(output).toContain("version");
  });

  it("excludes commands marked as hidden", async () => {
    const output = await renderCommandList();

    for (const cmd of Commands) {
      const mod = await importCommand(cmd);
      if (mod.hidden) {
        expect(output, `hidden command "${cmd}" should not appear`).not.toMatch(new RegExp(`^\\s*${cmd}\\b`, "m"));
      } else {
        expect(output, `non-hidden command "${cmd}" should appear`).toContain(cmd);
      }
    }
  });
});

describe("hasDetailedContent", () => {
  it("returns false for a minimal command with only description", () => {
    expect(hasDetailedContent({ description: "Simple" })).toBe(false);
  });

  it("returns true when detail is present", () => {
    expect(hasDetailedContent({ description: "Test", details: "Details" })).toBe(true);
  });

  it("returns true when sections are present", () => {
    expect(hasDetailedContent({ description: "Test", sections: [{ title: "Notes", content: "Some notes" }] })).toBe(true);
  });

  it("returns true when a flag has details", () => {
    expect(
      hasDetailedContent({
        description: "Test",
        args: { "--flag": { type: Boolean, description: "A flag", details: "Detailed" } },
      }),
    ).toBe(true);
  });

  it("returns true when a positional has details", () => {
    expect(
      hasDetailedContent({
        description: "Test",
        positionals: [{ name: "DIR", description: "Dir", details: "Detailed" }],
      }),
    ).toBe(true);
  });

  it("returns true when a flag has brief: false", () => {
    expect(
      hasDetailedContent({
        description: "Test",
        args: { "--advanced": { type: Boolean, description: "Advanced", brief: false } },
      }),
    ).toBe(true);
  });

  it("returns false when sections is an empty array", () => {
    expect(hasDetailedContent({ description: "Test", sections: [] })).toBe(false);
  });
});
