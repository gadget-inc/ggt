import { describe, expect, it } from "vitest";

import { extractAllowFlags, getAllowFlags, resolveAllowFlags } from "../../../src/services/command/allow.js";
import { FlagError } from "../../../src/services/command/flag.js";

describe("getAllowFlags", () => {
  it("returns allow-* keys from a flags definition", () => {
    const flags = {
      "--force": { type: Boolean },
      "--allow-problems": { type: Boolean },
      "--allow-charges": { type: Boolean },
      "--env": { type: String },
    };

    expect(getAllowFlags(flags)).toEqual(["--allow-problems", "--allow-charges"]);
  });

  it("returns an empty array when no allow flags exist", () => {
    expect(getAllowFlags({ "--force": { type: Boolean } })).toEqual([]);
  });
});

describe("extractAllowFlags", () => {
  const hasAllowFlags = ["--allow-problems"];

  it("extracts --allow-all from argv", () => {
    const result = extractAllowFlags(["--force", "--allow-all", "--env", "staging"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--force", "--env", "staging"],
      allowAll: true,
      allowValues: [],
    });
  });

  it("extracts --allow=value from argv", () => {
    const result = extractAllowFlags(["--force", "--allow=problems,charges"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--force"],
      allowAll: false,
      allowValues: ["problems,charges"],
    });
  });

  it("extracts --allow value from argv", () => {
    const result = extractAllowFlags(["--allow", "problems", "--force"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--force"],
      allowAll: false,
      allowValues: ["problems"],
    });
  });

  it("handles multiple --allow flags", () => {
    const result = extractAllowFlags(["--allow", "problems", "--allow=charges"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: [],
      allowAll: false,
      allowValues: ["problems", "charges"],
    });
  });

  it("passes through unrelated flags unchanged", () => {
    const result = extractAllowFlags(["--force", "--env", "staging"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--force", "--env", "staging"],
      allowAll: false,
      allowValues: [],
    });
  });

  it("passes --allow-* flags through to cleanedArgv", () => {
    const result = extractAllowFlags(["--allow-problems", "--allow-data-delete"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: ["--allow-problems", "--allow-data-delete"],
      allowAll: false,
      allowValues: [],
    });
  });

  it("throws FlagError for bare --allow at end of argv", () => {
    expect(() => extractAllowFlags(["--force", "--allow"], hasAllowFlags)).toThrow(FlagError);
    expect(() => extractAllowFlags(["--force", "--allow"], hasAllowFlags)).toThrow('Flag "--allow" requires a value');
  });

  it("handles --allow= with empty value", () => {
    const result = extractAllowFlags(["--allow="], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: [],
      allowAll: false,
      allowValues: [""],
    });
  });

  it("consumes next token as allow value even when it looks like a flag", () => {
    const result = extractAllowFlags(["--allow", "--force"], hasAllowFlags);

    expect(result).toEqual({
      cleanedArgv: [],
      allowAll: false,
      allowValues: ["--force"],
    });
  });

  it("returns argv unchanged when allowFlags is empty", () => {
    const argv = ["--force", "--allow=foo", "--allow-all"];
    const result = extractAllowFlags(argv, []);

    expect(result).toEqual({
      cleanedArgv: argv,
      allowAll: false,
      allowValues: [],
    });
    expect(result.cleanedArgv).toBe(argv);
  });

  it("does not consume --allow tokens after -- separator", () => {
    const result = extractAllowFlags(["--force", "--", "--allow=foo", "--allow-all"], hasAllowFlags);

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
    const flags: Record<string, unknown> = {};

    resolveAllowFlags(flags, allowFlags, { allowAll: true, allowValues: [] });

    expect(flags["--allow-problems"]).toBe(true);
    expect(flags["--allow-charges"]).toBe(true);
    expect(flags["--allow-data-delete"]).toBe(true);
  });

  it("sets all flags when --allow=all is passed", () => {
    const flags: Record<string, unknown> = {};

    resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["all"] });

    expect(flags["--allow-problems"]).toBe(true);
    expect(flags["--allow-charges"]).toBe(true);
    expect(flags["--allow-data-delete"]).toBe(true);
  });

  it("resolves comma-separated shorthands", () => {
    const flags: Record<string, unknown> = {};

    resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["problems,data-delete"] });

    expect(flags["--allow-problems"]).toBe(true);
    expect(flags["--allow-charges"]).toBeUndefined();
    expect(flags["--allow-data-delete"]).toBe(true);
  });

  it("resolves individual shorthands", () => {
    const flags: Record<string, unknown> = {};

    resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["charges"] });

    expect(flags["--allow-problems"]).toBeUndefined();
    expect(flags["--allow-charges"]).toBe(true);
  });

  it("throws FlagError for unknown shorthands", () => {
    const flags: Record<string, unknown> = {};

    expect(() => {
      resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["unknown"] });
    }).toThrow(FlagError);
  });

  it("includes available options and suggestion in error message", () => {
    const flags: Record<string, unknown> = {};

    expect(() => {
      resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["problem"] });
    }).toThrow(/Did you mean "problems"\?/);
    expect(() => {
      resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["problem"] });
    }).toThrow(/Available: problems, charges, data-delete/);
  });

  it("renders full error message for unknown shorthand", () => {
    const flags: Record<string, unknown> = {};

    expect(() => {
      resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["nope"] });
    }).toThrow(/Unknown allow flag "nope".*Available: problems, charges, data-delete/);
  });

  it("is a no-op for --allow-all when allowFlags is empty", () => {
    const flags: Record<string, unknown> = { "--force": true };

    resolveAllowFlags(flags, [], { allowAll: true, allowValues: [] });

    expect(flags).toEqual({ "--force": true });
  });

  it("ignores empty strings from comma splitting", () => {
    const flags: Record<string, unknown> = {};

    resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["problems,,charges,"] });

    expect(flags["--allow-problems"]).toBe(true);
    expect(flags["--allow-charges"]).toBe(true);
    expect(flags["--allow-data-delete"]).toBeUndefined();
  });

  it("sets all flags when 'all' appears in a comma-separated list", () => {
    const flags: Record<string, unknown> = {};

    resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["all,problems"] });

    expect(flags["--allow-problems"]).toBe(true);
    expect(flags["--allow-charges"]).toBe(true);
    expect(flags["--allow-data-delete"]).toBe(true);
  });

  it("composes --allow-all with individual flags", () => {
    const flags: Record<string, unknown> = { "--allow-problems": true };

    resolveAllowFlags(flags, allowFlags, { allowAll: true, allowValues: [] });

    expect(flags["--allow-problems"]).toBe(true);
    expect(flags["--allow-charges"]).toBe(true);
    expect(flags["--allow-data-delete"]).toBe(true);
  });

  it("composes --allow shorthand with explicit boolean flags", () => {
    const flags: Record<string, unknown> = { "--allow-problems": true };

    resolveAllowFlags(flags, allowFlags, { allowAll: false, allowValues: ["charges"] });

    expect(flags["--allow-problems"]).toBe(true);
    expect(flags["--allow-charges"]).toBe(true);
    expect(flags["--allow-data-delete"]).toBeUndefined();
  });
});
