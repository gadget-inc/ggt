import { describe, expect, it } from "vitest";
import { stdout } from "../../../src/services/output/stream.js";
import { expectStdout } from "../../__support__/stream.js";

describe("stdout", () => {
  it("strips leading newlines if the last line was empty", () => {
    // @ts-expect-error - _lastLineWasEmpty is private
    expect(stdout._lastLineWasEmpty).toBe(true);
    stdout.write("\nhello\n\n");
    expectStdout().toMatchInlineSnapshot(`
      "hello

      "
    `);

    // @ts-expect-error - _lastLineWasEmpty is private
    expect(stdout._lastLineWasEmpty).toBe(true);
    stdout.write("\nworld");
    expectStdout().toMatchInlineSnapshot(`
      "hello

      world"
    `);
  });

  it("does not strip leading newlines if the last line was not empty", () => {
    // @ts-expect-error - _lastLineWasEmpty is private
    stdout._lastLineWasEmpty = false;
    stdout.write("\nhello");
    expectStdout().toMatchInlineSnapshot(`
      "
      hello"
    `);
  });
});
