import { describe, it } from "vitest";
import { command } from "../../src/commands/version.js";
import { expectStdout } from "../__support__/stdout.js";
import { mockVersion } from "../__support__/version.js";

describe("version", () => {
  mockVersion();

  it("prints the version", async () => {
    await command({ _: [] });

    expectStdout().toEqual("1.2.3\n");
  });
});
