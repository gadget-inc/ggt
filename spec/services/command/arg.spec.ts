import { describe, expect, it } from "vitest";
import { parseArgs } from "../../../src/services/command/arg.js";

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
