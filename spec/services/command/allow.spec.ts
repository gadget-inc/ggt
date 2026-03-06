import { describe, expect, it } from "vitest";

import { extractAllowArgs, getAllowFlags, resolveAllowFlags } from "../../../src/services/command/allow.js";
import { ArgError } from "../../../src/services/command/arg.js";

describe("getAllowFlags", () => {
  it("returns allow-* keys from an args definition", () => {
    const args = {
      "--force": { type: Boolean },
      "--allow-problems": { type: Boolean },
      "--allow-charges": { type: Boolean },
      "--env": { type: String },
    };

    expect(getAllowFlags(args)).toEqual(["--allow-problems", "--allow-charges"]);
  });

  it("returns an empty array when no allow flags exist", () => {
    expect(getAllowFlags({ "--force": { type: Boolean } })).toEqual([]);
  });
});

describe("extractAllowArgs", () => {
  const hasAllowFlags = ["--allow-problems"];

  it("extracts --allow-all from argv", () => {
    const result = extractAllowArgs(["--force", "--allow-all", "--env", "staging"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--force", "--env", "staging"],
      allowAll: true,
      allowValues: [],
    });
  });

  it("extracts --allow=value from argv", () => {
    const result = extractAllowArgs(["--force", "--allow=problems,charges"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--force"],
      allowAll: false,
      allowValues: ["problems,charges"],
    });
  });

  it("extracts --allow value from argv", () => {
    const result = extractAllowArgs(["--allow", "problems", "--force"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--force"],
      allowAll: false,
      allowValues: ["problems"],
    });
  });

  it("handles multiple --allow flags", () => {
    const result = extractAllowArgs(["--allow", "problems", "--allow=charges"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: [],
      allowAll: false,
      allowValues: ["problems", "charges"],
    });
  });

  it("passes through unrelated flags unchanged", () => {
    const result = extractAllowArgs(["--force", "--env", "staging"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--force", "--env", "staging"],
      allowAll: false,
      allowValues: [],
    });
  });

  it("passes --allow-* flags through to cleanedArgv", () => {
    const result = extractAllowArgs(["--allow-problems", "--allow-data-delete"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--allow-problems", "--allow-data-delete"],
      allowAll: false,
      allowValues: [],
    });
  });

  it("throws ArgError for bare --allow at end of argv", () => {
    expect(() => extractAllowArgs(["--force", "--allow"], hasAllowFlags)).toThrow(ArgError);
    expect(() => extractAllowArgs(["--force", "--allow"], hasAllowFlags)).toThrow('Flag "--allow" requires a value');
  });

  it("handles --allow= with empty value", () => {
    const result = extractAllowArgs(["--allow="], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: [],
      allowAll: false,
      allowValues: [""],
    });
  });

  it("consumes next token as allow value even when it looks like a flag", () => {
    const result = extractAllowArgs(["--allow", "--force"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: [],
      allowAll: false,
      allowValues: ["--force"],
    });
  });

  it("returns argv unchanged when allowFlags is empty", () => {
    const argv = ["--force", "--allow=foo", "--allow-all"];
    const result = extractAllowArgs(argv, []);

    expect(result).toEqual({
      cleanedArgv: argv,
      allowAll: false,
      allowValues: [],
    });
    expect(result.cleanedArgv).toBe(argv);
  });

  it("does not consume --allow tokens after -- separator", () => {
    const result = extractAllowArgs(["--force", "--", "--allow=foo", "--allow-all"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--force", "--", "--allow=foo", "--allow-all"],
      allowAll: false,
      allowValues: [],
    });
  });
});

describe("resolveAllowFlags", () => {
  const allowFlags = ["--allow-problems", "--allow-charges", "--allow-data-delete"];

  it("sets all flags when allowAll is true", () => {
    const args: Record<string, unknown> = {};

    resolveAllowFlags(args, allowFlags, { allowAll: true, allowValues: [] });

    expect(args["--allow-problems"]).toBe(true);
    expect(args["--allow-charges"]).toBe(true);
    expect(args["--allow-data-delete"]).toBe(true);
  });

  it("sets all flags when --allow=all is passed", () => {
    const args: Record<string, unknown> = {};

    resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["all"] });

    expect(args["--allow-problems"]).toBe(true);
    expect(args["--allow-charges"]).toBe(true);
    expect(args["--allow-data-delete"]).toBe(true);
  });

  it("resolves comma-separated shorthands", () => {
    const args: Record<string, unknown> = {};

    resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["problems,data-delete"] });

    expect(args["--allow-problems"]).toBe(true);
    expect(args["--allow-charges"]).toBeUndefined();
    expect(args["--allow-data-delete"]).toBe(true);
  });

  it("resolves individual shorthands", () => {
    const args: Record<string, unknown> = {};

    resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["charges"] });

    expect(args["--allow-problems"]).toBeUndefined();
    expect(args["--allow-charges"]).toBe(true);
  });

  it("throws ArgError for unknown shorthands", () => {
    const args: Record<string, unknown> = {};

    expect(() => {
      resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["unknown"] });
    }).toThrow(ArgError);
  });

  it("includes available options and suggestion in error message", () => {
    const args: Record<string, unknown> = {};

    expect(() => {
      resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["problem"] });
    }).toThrow(/Did you mean "problems"\?/);
    expect(() => {
      resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["problem"] });
    }).toThrow(/Available: problems, charges, data-delete/);
  });

  it("renders full error message for unknown shorthand", () => {
    const args: Record<string, unknown> = {};

    expect(() => {
      resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["nope"] });
    }).toThrow(/Unknown allow flag "nope".*Available: problems, charges, data-delete/);
  });

  it("is a no-op for --allow-all when allowFlags is empty", () => {
    const args: Record<string, unknown> = { "--force": true };

    resolveAllowFlags(args, [], { allowAll: true, allowValues: [] });

    expect(args).toEqual({ "--force": true });
  });

  it("ignores empty strings from comma splitting", () => {
    const args: Record<string, unknown> = {};

    resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["problems,,charges,"] });

    expect(args["--allow-problems"]).toBe(true);
    expect(args["--allow-charges"]).toBe(true);
    expect(args["--allow-data-delete"]).toBeUndefined();
  });

  it("sets all flags when 'all' appears in a comma-separated list", () => {
    const args: Record<string, unknown> = {};

    resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["all,problems"] });

    expect(args["--allow-problems"]).toBe(true);
    expect(args["--allow-charges"]).toBe(true);
    expect(args["--allow-data-delete"]).toBe(true);
  });

  it("composes --allow-all with individual flags", () => {
    const args: Record<string, unknown> = { "--allow-problems": true };

    resolveAllowFlags(args, allowFlags, { allowAll: true, allowValues: [] });

    expect(args["--allow-problems"]).toBe(true);
    expect(args["--allow-charges"]).toBe(true);
    expect(args["--allow-data-delete"]).toBe(true);
  });

  it("composes --allow shorthand with explicit boolean flags", () => {
    const args: Record<string, unknown> = { "--allow-problems": true };

    resolveAllowFlags(args, allowFlags, { allowAll: false, allowValues: ["charges"] });

    expect(args["--allow-problems"]).toBe(true);
    expect(args["--allow-charges"]).toBe(true);
    expect(args["--allow-data-delete"]).toBeUndefined();
  });
});
