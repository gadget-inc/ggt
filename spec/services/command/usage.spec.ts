import { describe, expect, it } from "vitest";

import type { FlagDef } from "../../../src/services/command/arg.js";
import type { CommandModule } from "../../../src/services/command/command.js";

import { formatFlag, renderCommandList, renderDetailedUsage, renderShortUsage } from "../../../src/services/command/usage.js";

// stub run for test CommandModule instances
// oxlint-disable-next-line no-empty-function
const noop = async (): Promise<void> => {};

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

describe("renderShortUsage", () => {
  it("renders a minimal command with just a description", () => {
    const mod: CommandModule = {
      description: "Print this version of ggt",

      run: noop,
    };

    const output = renderShortUsage("version", mod);

    expect(output).toContain("Print this version of ggt");
    expect(output).toContain("ggt version");
    expect(output).not.toContain("[flags]");
    expect(output).toContain('Run "ggt version --help" for more information.');
  });

  it("renders flags with proper alignment", () => {
    const mod: CommandModule = {
      description: "Push your local files",
      args: {
        "--app": { type: String, alias: "-a", description: "Select the application" },
        "--force": { type: Boolean, alias: "-f", description: "Force the operation" },
      },

      run: noop,
    };

    const output = renderShortUsage("push", mod);

    expect(output).toContain("FLAGS");
    expect(output).toContain("--app");
    expect(output).toContain("--force");
    expect(output).toContain("Select the application");
    expect(output).toContain("Force the operation");
  });

  it("renders subcommands in a COMMANDS section", () => {
    const mod: CommandModule = {
      description: "Generate shell completions",
      subcommandDefs: [
        { name: "bash", description: "Generate Bash completions" },
        { name: "zsh", description: "Generate Zsh completions" },
        { name: "fish", description: "Generate Fish completions" },
      ],

      run: noop,
    };

    const output = renderShortUsage("completion", mod);

    expect(output).toContain("COMMANDS");
    expect(output).toContain("bash");
    expect(output).toContain("Generate Bash completions");
    expect(output).toContain("zsh");
    expect(output).toContain("fish");
  });

  it("renders examples with plain $ prefix", () => {
    const mod: CommandModule = {
      description: "Start developing",
      examples: ["ggt dev ~/myApp --app myBlog", "ggt dev --env main --prefer local"],

      run: noop,
    };

    const output = renderShortUsage("dev", mod);

    expect(output).toContain("EXAMPLES");
    expect(output).toContain("$ ggt dev ~/myApp --app myBlog");
    expect(output).toContain("$ ggt dev --env main --prefer local");
  });

  it("renders a positional argument in the usage line", () => {
    const mod: CommandModule = {
      description: "Start developing",
      positional: "[DIRECTORY]",
      args: {
        "--force": { type: Boolean, description: "Force the operation" },
      },

      run: noop,
    };

    const output = renderShortUsage("dev", mod);

    expect(output).toContain("ggt dev [DIRECTORY] [flags]");
  });

  it("omits [flags] when there are no flags", () => {
    const mod: CommandModule = {
      description: "Simple command",

      run: noop,
    };

    const output = renderShortUsage("test", mod);

    expect(output).not.toContain("FLAGS");
    expect(output).toContain("Simple command");
    expect(output).toContain("ggt test");
    expect(output).not.toContain("[flags]");
  });

  it("renders an ARGUMENTS section for positionalArgs", () => {
    const mod: CommandModule = {
      description: "Start developing",
      positional: "[DIRECTORY]",
      positionalArgs: [{ name: "DIRECTORY", description: 'The local directory to sync files to (default: ".")' }],
      args: {
        "--force": { type: Boolean, description: "Force the operation" },
      },

      run: noop,
    };

    const output = renderShortUsage("dev", mod);

    expect(output).toContain("ARGUMENTS");
    expect(output).toContain("DIRECTORY");
    expect(output).toContain('The local directory to sync files to (default: ".")');
  });

  it("renders a comprehensive command", () => {
    const mod: CommandModule = {
      description: "Start developing your application",
      positional: "[DIRECTORY]",
      positionalArgs: [{ name: "DIRECTORY", description: 'The local directory to sync files to (default: ".")' }],
      args: {
        "--app": { type: String, alias: "-a", description: "Select the application", valueName: "name" },
        "--env": { type: String, alias: "-e", description: "Select the environment", valueName: "environment" },
        "--force": { type: Boolean, description: "Force the operation" },
      },
      examples: ["ggt dev ~/myApp --app myBlog"],

      run: noop,
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
        $ ggt dev ~/myApp --app myBlog

      Run "ggt dev --help" for more information."
    `);
  });
});

describe("renderDetailedUsage", () => {
  it("produces the same output as renderShortUsage when no extra metadata exists", () => {
    const mod: CommandModule = {
      description: "Print this version of ggt",
      run: noop,
    };

    expect(renderDetailedUsage("version", mod)).toBe(renderShortUsage("version", mod));
  });

  it("includes longDescription below the description", () => {
    const mod: CommandModule = {
      description: "Push your local files",
      longDescription: "Pushes your local files to your environment directory.\n\nChanges are tracked since last sync.",
      run: noop,
    };

    const output = renderDetailedUsage("push", mod);

    expect(output).toContain("Push your local files");
    expect(output).toContain("Pushes your local files to your environment directory.");
    expect(output).toContain("Changes are tracked since last sync.");
  });

  it("renders sections with uppercase title and content", () => {
    const mod: CommandModule = {
      description: "Start developing",
      sections: [
        { title: "Ignoring files", content: "Use .ignore to exclude files." },
        { title: "Notes", content: "Only works with development environments." },
      ],
      run: noop,
    };

    const output = renderDetailedUsage("dev", mod);

    expect(output).toContain("IGNORING FILES");
    expect(output).toContain("Use .ignore to exclude files.");
    expect(output).toContain("NOTES");
    expect(output).toContain("Only works with development environments.");
  });

  it("renders expanded flag format when a flag has longDescription", () => {
    const mod: CommandModule = {
      description: "Start developing",
      args: {
        "--prefer": {
          type: String,
          description: "Conflict resolution preference",
          longDescription: "When conflicts are detected, use this preference\nto automatically resolve them.",
        },
        "--force": { type: Boolean, description: "Force the operation" },
      },
      run: noop,
    };

    const output = renderDetailedUsage("dev", mod);

    expect(output).toContain("--prefer");
    expect(output).toContain("When conflicts are detected, use this preference");
    expect(output).toContain("to automatically resolve them.");
    expect(output).toContain("--force");
    expect(output).toContain("Force the operation");
  });

  it("renders expanded positionalArgs with longDescription", () => {
    const mod: CommandModule = {
      description: "Start developing",
      positional: "[DIRECTORY]",
      positionalArgs: [
        {
          name: "DIRECTORY",
          description: 'The local directory to sync files to (default: ".")',
          longDescription: "The local directory to sync files to.\n\nDefaults to the current working directory.",
        },
      ],
      run: noop,
    };

    const output = renderDetailedUsage("dev", mod);

    expect(output).toContain("ARGUMENTS");
    expect(output).toContain("DIRECTORY");
    expect(output).toContain("The local directory to sync files to.");
    expect(output).toContain("Defaults to the current working directory.");
  });

  it("renders longDescription, sections, and expanded flags together", () => {
    const mod: CommandModule = {
      description: "Start developing your application",
      longDescription: "Watches your local files and syncs them to your Gadget environment.\n\nChanges are tracked since last sync.",
      args: {
        "--prefer": {
          type: String,
          description: "Conflict resolution preference",
          longDescription: "When conflicts are detected, use this preference\nto automatically resolve them.",
        },
        "--force": { type: Boolean, description: "Force the operation" },
      },
      sections: [{ title: "Ignoring files", content: "Use .ignore to exclude files from syncing." }],
      run: noop,
    };

    const output = renderDetailedUsage("dev", mod);

    // longDescription
    expect(output).toContain("Watches your local files and syncs them to your Gadget environment.");
    expect(output).toContain("Changes are tracked since last sync.");
    // section (uppercase)
    expect(output).toContain("IGNORING FILES");
    expect(output).toContain("Use .ignore to exclude files from syncing.");
    // expanded flag with longDescription
    expect(output).toContain("When conflicts are detected, use this preference");
    expect(output).toContain("to automatically resolve them.");
    // flag without longDescription still renders
    expect(output).toContain("--force");
    expect(output).toContain("Force the operation");
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
    expect(output).toContain("completion");
  });

  it("excludes commands marked as hidden", async () => {
    const { Commands, importCommand } = await import("../../../src/services/command/command.js");
    const output = await renderCommandList();

    for (const cmd of Commands) {
      const mod = await importCommand(cmd);
      if (mod.hidden) {
        expect(output, `hidden command "${cmd}" should not appear`).not.toContain(`${cmd} `);
      } else {
        expect(output, `non-hidden command "${cmd}" should appear`).toContain(cmd);
      }
    }
  });
});
