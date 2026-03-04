import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { output } from "../../../src/services/output/output.js";
import { activeSpinner, clearAllSpinners, spin } from "../../../src/services/output/spinner.js";
import { mock } from "../../__support__/mock.js";
import { expectStdout } from "../../__support__/output.js";

describe("spin", () => {
  afterEach(() => {
    // clean up all active spinners so tests don't interfere
    clearAllSpinners();
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

  describe("idempotent finalization", () => {
    it("calling succeed() twice does not throw and only writes one final render", () => {
      const s = spin("A");
      s.succeed();
      // second call should be a no-op -- no additional output
      s.succeed();
      expectStdout().toMatchInlineSnapshot(`
        "⠙ A
        ✔ A
        "
      `);
    });

    it("calling fail() on an already-succeeded spinner is a no-op", () => {
      const s = spin("A");
      s.succeed();
      // fail after succeed should not add a fail line
      s.fail();
      expectStdout().toMatchInlineSnapshot(`
        "⠙ A
        ✔ A
        "
      `);
    });

    it("calling clear() on an already-cleared spinner is a no-op", () => {
      const s = spin("A");
      s.clear();
      // second clear should not throw or add output
      s.clear();
      expectStdout().toMatchInlineSnapshot(`
        "⠙ A
        "
      `);
    });

    it("calling succeed() on a cleared spinner is a no-op", () => {
      const s = spin("A");
      s.clear();
      // succeed after clear should not add a success line
      s.succeed();
      expectStdout().toMatchInlineSnapshot(`
        "⠙ A
        "
      `);
    });
  });

  it("allows calling spin() while another spinner is already active", () => {
    const a = spin("First");
    expect(() => spin("Second")).not.toThrow();
    a.clear();
  });

  it("activeSpinner returns the most recently created spinner", () => {
    spin("A");
    const b = spin("B");
    expect(activeSpinner).toBe(b);
  });

  it("when the top spinner is finalized, activeSpinner becomes the previous spinner", () => {
    const a = spin("A");
    const b = spin("B");
    b.succeed();
    expect(activeSpinner).toBe(a);
    a.succeed();
    expect(activeSpinner).toBeUndefined();
  });

  it("clearAllSpinners() sets activeSpinner to undefined and finalizes all spinners", () => {
    spin("A");
    spin("B");
    clearAllSpinners();
    expect(activeSpinner).toBeUndefined();
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

  describe("stack-aware rendering", () => {
    it("when two spinners are active, only the top spinner's text appears in output", () => {
      spin("A");
      spin("B");
      // In non-interactive mode, each spinner writes its first frame.
      // The interval-based rerender should only fire for the top spinner,
      // so we should see A's first frame and B's first frame, nothing more.
      expectStdout().toMatchInlineSnapshot(`
        "⠙ A
        ⠙ B
        "
      `);
    });

    it("when the top spinner finalizes, the remaining spinner resumes rendering", () => {
      const a = spin("A");
      const b = spin("B");
      b.succeed();
      expect(activeSpinner).toBe(a);
      // After B succeeds, we should see A's first frame, B's first frame,
      // and B's success line. A is still active.
      expectStdout().toMatchInlineSnapshot(`
        "⠙ A
        ⠙ B
        ✔ B
        "
      `);
    });

    it("SIGINT flow: clearAllSpinners then spin works without error", () => {
      spin("A");
      clearAllSpinners();
      expect(activeSpinner).toBeUndefined();
      const s = spin("Stopping");
      expect(activeSpinner).toBe(s);
      expect(s.text).toBe("Stopping");
    });
  });

  describe("concurrent scenarios", () => {
    it("finalize top-first: spin A, spin B, succeed B, succeed A", () => {
      const a = spin("A");
      const b = spin("B");

      b.succeed();
      expect(activeSpinner).toBe(a);

      // stdout should show A's first frame, B's first frame, and B's success
      expectStdout().toMatchInlineSnapshot(`
        "⠙ A
        ⠙ B
        ✔ B
        "
      `);

      a.succeed();
      expect(activeSpinner).toBeUndefined();

      // now A's success line should also appear
      expectStdout().toMatchInlineSnapshot(`
        "⠙ A
        ⠙ B
        ✔ B
        ✔ A
        "
      `);
    });

    it("finalize bottom-first: spin A, spin B, succeed A, verify activeSpinner is B", () => {
      const a = spin("A");
      const b = spin("B");

      a.succeed();
      expect(activeSpinner).toBe(b);

      b.succeed();
      expect(activeSpinner).toBeUndefined();
    });

    it("stress test: 5 nested spinners finalized in mixed order", () => {
      const s1 = spin("S1");
      const s2 = spin("S2");
      const s3 = spin("S3");
      const s4 = spin("S4");
      const s5 = spin("S5");

      // finalize s3 -- remaining: [s1, s2, s4, s5], active = s5
      s3.succeed();
      expect(activeSpinner).toBe(s5);

      // finalize s5 -- remaining: [s1, s2, s4], active = s4
      s5.succeed();
      expect(activeSpinner).toBe(s4);

      // finalize s1 -- remaining: [s2, s4], active = s4
      s1.succeed();
      expect(activeSpinner).toBe(s4);

      // finalize s4 -- remaining: [s2], active = s2
      s4.succeed();
      expect(activeSpinner).toBe(s2);

      // finalize s2 -- remaining: [], active = undefined
      s2.succeed();
      expect(activeSpinner).toBeUndefined();
    });

    it("signal handler scenario: clearAllSpinners then spin Stopping", () => {
      spin("Pulling files");
      spin("Running yarn install");

      clearAllSpinners();
      expect(activeSpinner).toBeUndefined();

      const stopping = spin("Stopping");
      expect(activeSpinner).toBe(stopping);
      expect(stopping.text).toBe("Stopping");
    });
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

  describe("interactive multi-spinner display", () => {
    let updateSpinnerCalls: string[];
    let persistSpinnerCalls: string[];

    beforeEach(() => {
      vi.useFakeTimers();
      mock(output, "isInteractive", "get", () => true);
      // mock updateSpinner and persistSpinner as no-ops that record calls,
      // since the real implementations use TTY methods not available in tests
      updateSpinnerCalls = [];
      mock(output, "updateSpinner", (text: string | ((current: string) => string)) => {
        updateSpinnerCalls.push(typeof text === "string" ? text : text(""));
      });
      persistSpinnerCalls = [];
      mock(output, "persistSpinner", (text?: string) => {
        persistSpinnerCalls.push(text ?? "");
      });
    });

    afterEach(() => {
      clearAllSpinners();
      vi.useRealTimers();
    });

    it("composes two concurrent spinners into a single updateSpinner call", () => {
      spin("A");
      spin("B");

      // the last updateSpinner call should contain both spinners' text
      const lastCall = updateSpinnerCalls.at(-1)!;
      expect(lastCall).toContain("A");
      expect(lastCall).toContain("B");
    });

    it("all spinners animate independently on interval ticks", () => {
      spin("A");
      spin("B");

      updateSpinnerCalls.length = 0;

      // advance time by one spinner interval (80ms for "dots")
      vi.advanceTimersByTime(80);

      // both spinners should have triggered renders, and the composed
      // display should still contain both
      const lastCall = updateSpinnerCalls.at(-1)!;
      expect(lastCall).toContain("A");
      expect(lastCall).toContain("B");
    });

    it("finalizing a spinner persists its text and updates display with remaining", () => {
      spin("A");
      const b = spin("B");

      b.succeed();

      // B's final text should be persisted via persistSpinner
      expect(persistSpinnerCalls.length).toBeGreaterThan(0);
      const persistedText = persistSpinnerCalls.at(-1)!;
      expect(persistedText).toContain("B");

      // the sticky area should now show only A
      const lastCall = updateSpinnerCalls.at(-1)!;
      expect(lastCall).toContain("A");
      expect(lastCall).not.toContain("B");
    });

    it("finalizing all spinners clears the sticky area", () => {
      const a = spin("A");
      const b = spin("B");

      b.succeed();
      a.succeed();

      // after all spinners are finalized, updateSpinner should be
      // called with an empty string (no remaining spinners)
      const lastCall = updateSpinnerCalls.at(-1)!;
      expect(lastCall).toBe("");
    });

    it("finalizing a middle spinner leaves other spinners in the display", () => {
      spin("A");
      const b = spin("B");
      spin("C");

      b.succeed();

      // the sticky area should show A and C, but not B
      const lastCall = updateSpinnerCalls.at(-1)!;
      expect(lastCall).toContain("A");
      expect(lastCall).not.toContain("B");
      expect(lastCall).toContain("C");
    });

    it("clearAllSpinners clears the sticky area", () => {
      spin("A");
      spin("B");

      clearAllSpinners();

      // the final updateSpinner call should be empty
      const lastCall = updateSpinnerCalls.at(-1)!;
      expect(lastCall).toBe("");
    });
  });
});
