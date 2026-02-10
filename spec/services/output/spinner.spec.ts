import { afterEach, describe, expect, it } from "vitest";

import { output } from "../../../src/services/output/output.js";
import { activeSpinner, spin } from "../../../src/services/output/spinner.js";
import { expectStdout } from "../../__support__/output.js";

describe("spin", () => {
  afterEach(() => {
    // clean up any active spinner so tests don't interfere
    if (activeSpinner) {
      activeSpinner.clear();
    }
  });

  it("writes the first frame to stdout", () => {
    spin("Loading...");
    expectStdout().toMatchInlineSnapshot(`
      "⠙ Loading...
      "
    `);
  });

  it("returns a spinner object", () => {
    const s = spin("Loading...");
    expect(s).toHaveProperty("text", "Loading...");
    expect(s).toHaveProperty("succeed");
    expect(s).toHaveProperty("fail");
    expect(s).toHaveProperty("clear");
  });

  it("sets activeSpinner while spinning", () => {
    expect(activeSpinner).toBeUndefined();
    const s = spin("Loading...");
    expect(activeSpinner).toBe(s);
  });

  describe("succeed", () => {
    it("writes the success symbol with the original text", () => {
      const s = spin("Loading...");
      s.succeed();
      expectStdout().toMatchInlineSnapshot(`
        "⠙ Loading...
        ✔ Loading...
        "
      `);
    });

    it("writes the success symbol with custom text", () => {
      const s = spin("Loading...");
      s.succeed("Done!");
      expectStdout().toMatchInlineSnapshot(`
        "⠙ Loading...
        ✔ Done!
        "
      `);
    });

    it("clears activeSpinner", () => {
      const s = spin("Loading...");
      s.succeed();
      expect(activeSpinner).toBeUndefined();
    });

    it("updates the spinner text", () => {
      const s = spin("Loading...");
      s.succeed("Done!");
      expect(s.text).toBe("Done!");
    });
  });

  describe("fail", () => {
    it("writes the fail symbol with the original text", () => {
      const s = spin("Loading...");
      s.fail();
      expectStdout().toMatchInlineSnapshot(`
        "⠙ Loading...
        ✘ Loading...
        "
      `);
    });

    it("writes the fail symbol with custom text", () => {
      const s = spin("Loading...");
      s.fail("Error!");
      expectStdout().toMatchInlineSnapshot(`
        "⠙ Loading...
        ✘ Error!
        "
      `);
    });

    it("clears activeSpinner", () => {
      const s = spin("Loading...");
      s.fail();
      expect(activeSpinner).toBeUndefined();
    });

    it("updates the spinner text", () => {
      const s = spin("Loading...");
      s.fail("Error!");
      expect(s.text).toBe("Error!");
    });
  });

  describe("clear", () => {
    it("clears activeSpinner", () => {
      const s = spin("Loading...");
      s.clear();
      expect(activeSpinner).toBeUndefined();
    });

    it("sets text to empty string", () => {
      const s = spin("Loading...");
      s.clear();
      expect(s.text).toBe("");
    });
  });

  it("throws when a spinner is already active", () => {
    spin("First");
    expect(() => spin("Second")).toThrow("a spinner is already active");
  });

  it("allows a new spinner after the previous one succeeds", () => {
    const s1 = spin("First");
    s1.succeed();
    const s2 = spin("Second");
    expect(activeSpinner).toBe(s2);
    s2.clear();
  });

  it("allows a new spinner after the previous one fails", () => {
    const s1 = spin("First");
    s1.fail();
    const s2 = spin("Second");
    expect(activeSpinner).toBe(s2);
    s2.clear();
  });

  it("allows a new spinner after the previous one is cleared", () => {
    const s1 = spin("First");
    s1.clear();
    const s2 = spin("Second");
    expect(activeSpinner).toBe(s2);
    s2.clear();
  });

  describe("with options object", () => {
    it("accepts SpinnerOptions", () => {
      const s = spin({ content: "Working..." });
      expect(s.text).toBe("Working...");
      s.clear();
    });

    it("respects ensureEmptyLineAbove", () => {
      // write something first so lastPrintedLineWasEmpty is false,
      // otherwise the output layer strips the leading newline
      output.lastPrintedLineWasEmpty = false;
      const s = spin({ content: "Working...", ensureEmptyLineAbove: true });
      expectStdout().toMatchInlineSnapshot(`
        "
        ⠙ Working...
        "
      `);
      s.clear();
    });
  });
});
