import arg from "arg";
import { describe, expect, it } from "vitest";

import { extractFlags, parseArgs } from "../../../src/services/command/arg.js";

describe("parseArgs", () => {
  it("works", () => {
    process.argv = ["node", "test", "--hello", "world"];

    const args = parseArgs({ "--hello": String });

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
      { "--hello": String, "--help": Boolean },
      { argv: ["--hello", "world", "git", "--help"], permissive: true, stopAtPositional: true },
    );

    expect(args).toEqual({ "--hello": "world", _: ["git", "--help"] });
  });
});

describe("extractFlags", () => {
  it("extracts bare handler", () => {
    const flags = extractFlags({ "--force": Boolean });

    expect(flags).toEqual([{ name: "--force", aliases: [], type: "boolean", description: "" }]);
  });

  it("extracts object with alias array", () => {
    const flags = extractFlags({
      "--app": { type: String, alias: ["-a", "--application"], description: "App name" },
    });

    expect(flags).toEqual([{ name: "--app", aliases: ["-a", "--application"], type: "string", description: "App name" }]);
  });

  it("skips -h flag", () => {
    const flags = extractFlags({
      "-h": { type: Boolean },
      "--help": { type: Boolean, description: "Show help" },
    });

    expect(flags).toHaveLength(1);
    expect(flags[0]!.name).toBe("--help");
  });

  it("resolves arg.COUNT to count type", () => {
    const flags = extractFlags({
      "--verbose": { type: arg.COUNT, alias: ["-v"], description: "Verbosity" },
    });

    expect(flags).toEqual([{ name: "--verbose", aliases: ["-v"], type: "count", description: "Verbosity" }]);
  });

  it("resolves custom handler function to string type", () => {
    const flags = extractFlags({
      "--level": (value: string) => value,
    });

    expect(flags).toEqual([{ name: "--level", aliases: [], type: "string", description: "" }]);
  });
});
