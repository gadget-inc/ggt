import { describe, it, vi } from "vitest";
import { command } from "../../src/commands/version.js";
import { config } from "../../src/services/config/config.js";
import { expectStdout } from "../__support__/stdout.js";

describe("version", () => {
  it("prints the version", async () => {
    vi.spyOn(config, "version", "get").mockReturnValue("1.2.3");

    await command({ _: [] });

    expectStdout().toEqual("1.2.3\n");
  });
});
