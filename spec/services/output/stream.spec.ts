import { describe, expect, it } from "vitest";
import { stdout } from "../../../src/services/output/stream.js";
import { expectStdout } from "../../__support__/stream.js";

describe("stdout", () => {
  it("works", () => {
    // @ts-expect-error - _lastLineWasEmpty is private
    expect(stdout._lastLineWasEmpty).toBe(true);
    stdout.write("\nhello");
    expectStdout().toEqual("hello");
  });
});
