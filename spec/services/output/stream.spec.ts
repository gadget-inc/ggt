import { describe, expect, it } from "vitest";
import { stdout } from "../../../src/services/output/stream.js";
import { expectStdout } from "../../__support__/stream.js";

describe("stdout", () => {
  it("strips leading newlines if the last line was empty", () => {
    expect(stdout.lastLineWasEmpty).toBe(true);

    stdout.write("\nhello\n");

    expectStdout().toMatchInlineSnapshot(`
      "hello
      "
    `);
  });

  it("does not strip leading newlines if the last line was not empty", () => {
    stdout.lastLineWasEmpty = false;

    stdout.write("\nhello");

    expectStdout().toMatchInlineSnapshot(`
      "
      hello"
    `);
  });
});
