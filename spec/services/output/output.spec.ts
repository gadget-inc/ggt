import { describe, expect, it } from "vitest";

import { output } from "../../../src/services/output/output.ts";
import { expectStdout } from "../../__support__/output.ts";

describe("output", () => {
  it("strips leading newlines if the last line was empty", () => {
    expect(output.lastPrintedLineWasEmpty).toBe(true);

    output.writeStdout("\nhello\n");

    expectStdout().toMatchInlineSnapshot(`
      "hello
      "
    `);
  });

  it("does not strip leading newlines if the last line was not empty", () => {
    output.lastPrintedLineWasEmpty = false;

    output.writeStdout("\nhello");

    expectStdout().toMatchInlineSnapshot(`
      "
      hello"
    `);
  });
});
