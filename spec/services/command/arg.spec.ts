import arg from "arg";
import { describe, expect, it } from "vitest";

import { extractFlags, hidden, parseArgs, toEntryArray } from "../../../src/services/command/arg.js";

describe("parseArgs", () => {
  it("works", () => {
    process.argv = ["node", "test", "--hello", "world"];

    const args = parseArgs({ "--hello": { type: String } });

    expect(args).toEqual({ "--hello": "world", _: [] });
  });

  it("works with defaults", () => {
    process.argv = ["node", "test"];

    const args = parseArgs({ "--hello": { type: String, default: "world" } });

    expect(args).toEqual({ "--hello": "world", _: [] });
  });

  it("works with aliases", () => {
    process.argv = ["node", "test", "-h", "world"];

    const args = parseArgs({ "--hello": { type: String, alias: "-h" } });

    expect(args).toEqual({ "--hello": "world", _: [] });
  });

  it("works with aliases and defaults", () => {
    process.argv = ["node", "test"];

    const args = parseArgs({ "--hello": { type: String, alias: "-h", default: "world" } });

    process.argv = ["node", "test", "-h", "world"];

    const args2 = parseArgs({ "--hello": { type: String, alias: "-h", default: "world" } });

    expect(args).toEqual({ "--hello": "world", _: [] });
    expect(args2).toEqual(args);
  });

  it("works with options", () => {
    process.argv = ["node", "test"];

    const args = parseArgs(
      { "--hello": { type: String }, "--help": { type: Boolean } },
      { argv: ["--hello", "world", "git", "--help"], permissive: true, stopAtPositional: true },
    );

    expect(args).toEqual({ "--hello": "world", _: ["git", "--help"] });
  });

  it("resolves hidden alias at parse time", () => {
    process.argv = ["node", "test", "--debug"];

    const args = parseArgs({ "--verbose": { type: Boolean, alias: ["-v", hidden("--debug")] } });

    expect(args).toEqual({ "--verbose": true, _: [] });
    expect("--debug" in args).toBe(false);
  });
});

describe("toEntryArray", () => {
  it("returns an empty array for undefined", () => {
    expect(toEntryArray(undefined)).toEqual([]);
  });

  it("wraps a scalar string in an array", () => {
    expect(toEntryArray("-v")).toEqual(["-v"]);
  });

  it("returns an array unchanged", () => {
    const aliases = ["-v", "--verbose"];
    expect(toEntryArray(aliases)).toEqual(["-v", "--verbose"]);
  });
});

describe("extractFlags", () => {
  it("propagates hidden flag", () => {
    const flags = extractFlags({
      "--internal": { type: String, hidden: true },
      "--visible": { type: String },
    });

    expect(flags).toHaveLength(2);
    const internal = flags.find((f) => f.name === "--internal");
    const visible = flags.find((f) => f.name === "--visible");
    expect(internal?.hidden).toBe(true);
    expect(visible?.hidden).toBeUndefined();
  });

  it("extracts object with alias array", () => {
    const flags = extractFlags({
      "--app": { type: String, alias: ["-a", "--application"], description: "App name" },
    });

    expect(flags).toEqual([{ name: "--app", aliases: ["-a", "--application"], type: "string", description: "App name" }]);
  });

  it("includes -h as alias when declared via alias on --help", () => {
    const flags = extractFlags({
      "--help": { type: Boolean, alias: "-h", description: "Show help" },
    });

    expect(flags).toHaveLength(1);
    expect(flags[0]!.name).toBe("--help");
    expect(flags[0]!.aliases).toEqual(["-h"]);
  });

  it.each([
    ["Boolean", Boolean, "boolean"],
    ["String", String, "string"],
    ["Number", Number, "number"],
    ["arg.COUNT", arg.COUNT, "count"],
    ["custom handler function", (v: string) => v, "string"],
  ])("resolves %s handler to %s type", (_label, handler, expectedType) => {
    const flags = extractFlags({ "--flag": { type: handler as arg.Handler } });
    expect(flags[0]!.type).toBe(expectedType);
  });

  it("extracts details when present", () => {
    const flags = extractFlags({
      "--prefer": {
        type: String,
        description: "Conflict resolution preference",
        details: "When conflicts are detected, use this preference\nto automatically resolve them.",
      },
      "--force": { type: Boolean, description: "Force the operation" },
    });

    expect(flags).toHaveLength(2);
    expect(flags[0]!.details).toBe("When conflicts are detected, use this preference\nto automatically resolve them.");
    expect(flags[1]!.details).toBeUndefined();
  });

  it("extracts valueName from arg definition", () => {
    const flags = extractFlags({ "--app": { type: String, description: "App name", valueName: "name" } });

    expect(flags).toEqual([{ name: "--app", aliases: [], type: "string", description: "App name", valueName: "name" }]);
  });

  it("omits valueName when not specified", () => {
    const flags = extractFlags({ "--force": { type: Boolean } });

    expect(flags).toHaveLength(1);
    expect(flags[0]!.valueName).toBeUndefined();
  });
});
