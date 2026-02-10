import { describe, it } from "vitest";

import { footer } from "../../../src/services/output/footer.js";
import { expectStdout } from "../../__support__/output.js";

describe("footer", () => {
  it("writes text to stdout in non-interactive mode", () => {
    footer("Hello, footer!");
    expectStdout().toContain("Hello, footer!");
  });

  it("writes options-based content to stdout in non-interactive mode", () => {
    footer({ content: "Footer content" });
    expectStdout().toContain("Footer content");
  });

  it("appends a newline via sprintln", () => {
    footer("No newline");
    const result = expectStdout();
    // sprintln ensures a trailing newline
    result.toMatch(/No newline\n$/);
  });
});
