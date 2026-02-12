import stripAnsi from "strip-ansi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { output } from "../../../src/services/output/output.js";
import { Prompt } from "../../../src/services/output/prompt.js";
import { select, type SelectOptions } from "../../../src/services/output/select.js";
import { mock } from "../../__support__/mock.js";

/**
 * Simulate a keypress event on process.stdin.
 */
const simulateKeypress = (char: string, name?: string, opts?: { ctrl?: boolean }): void => {
  process.stdin.emit("keypress", char, {
    name: name ?? char,
    ctrl: opts?.ctrl ?? false,
    meta: false,
  });
};

const type = (text: string): void => {
  for (const char of text) {
    simulateKeypress(char);
  }
};

const enter = (): void => simulateKeypress("\r", "return");
const space = (): void => simulateKeypress(" ", "space");
const backspace = (): void => simulateKeypress("", "backspace");
const escape = (): void => simulateKeypress("", "escape");
const arrowDown = (): void => simulateKeypress("", "down");
const arrowUp = (): void => simulateKeypress("", "up");

describe("select", () => {
  let updatePromptCalls: string[];
  let persistPromptCalls: string[];

  beforeEach(() => {
    updatePromptCalls = [];
    persistPromptCalls = [];

    // Mock output.isInteractive to return true
    mock(output, "isInteractive", "get", () => true);

    // Capture rendered prompt text
    mock(output, "updatePrompt", (text: string | ((current: string) => string)) => {
      const resolved = typeof text === "function" ? text("") : text;
      updatePromptCalls.push(resolved);
    });

    mock(output, "persistPrompt", (text?: string) => {
      persistPromptCalls.push(text ?? "");
    });
  });

  afterEach(() => {
    // Reset Prompt.active in case a test failed mid-prompt
    Prompt.active = false;
  });

  /**
   * Helper to get the last rendered text, stripped of ANSI codes.
   */
  const lastRendered = (): string => {
    const last = updatePromptCalls[updatePromptCalls.length - 1];
    expect(last).toBeDefined();
    return stripAnsi(last!);
  };

  /**
   * Helper to start a select prompt and return the promise.
   * The promise is NOT awaited so we can simulate keypress events.
   */
  const startSelect = <Choice extends string>(options: SelectOptions<Choice>): Promise<Choice> => {
    return select(options);
  };

  describe("searchable flat choices", () => {
    // Use choices with distinct substrings for predictable filtering
    const choices = ["foo", "foobar", "bar", "baz", "qux"];

    it("typing filters displayed choices", async () => {
      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      type("fo");

      const rendered = lastRendered();
      expect(rendered).toContain("foo");
      expect(rendered).toContain("foobar");
      expect(rendered).not.toContain("baz");
      expect(rendered).not.toContain("qux");

      enter();
      await expect(promise).resolves.toBe("foo");
    });

    it("case-insensitive matching", async () => {
      const promise = startSelect({
        choices: ["Alpha", "beta"],
        searchable: true,
        content: "Pick one",
      });

      type("ALPHA");

      const rendered = lastRendered();
      expect(rendered).toContain("Alpha");
      expect(rendered).not.toContain("beta");

      enter();
      await expect(promise).resolves.toBe("Alpha");
    });

    it("backspace re-expands results", async () => {
      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      // "ba" matches "bar", "baz", "foobar"
      type("ba");

      let rendered = lastRendered();
      expect(rendered).toContain("bar");
      expect(rendered).toContain("baz");
      expect(rendered).toContain("foobar");
      expect(rendered).not.toContain("qux");

      // backspace: filter is "b" → matches "bar", "baz", "foobar"
      backspace();
      rendered = lastRendered();
      expect(rendered).toContain("bar");
      expect(rendered).toContain("baz");
      expect(rendered).toContain("foobar");
      expect(rendered).not.toContain("qux");

      // backspace again: filter is empty → all choices shown
      backspace();
      rendered = lastRendered();
      expect(rendered).toContain("foo");
      expect(rendered).toContain("foobar");
      expect(rendered).toContain("bar");
      expect(rendered).toContain("baz");
      expect(rendered).toContain("qux");

      enter();
      await expect(promise).resolves.toBe("foo");
    });

    it("escape clears filter without exiting", async () => {
      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      type("zzz");

      let rendered = lastRendered();
      expect(rendered).toContain("No matches found");

      // escape clears the filter
      escape();
      rendered = lastRendered();
      expect(rendered).toContain("foo");
      expect(rendered).toContain("bar");
      expect(rendered).not.toContain("No matches found");

      enter();
      await expect(promise).resolves.toBe("foo");
    });

    it("escape with empty filter bells instead of aborting", async () => {
      // oxlint-disable-next-line no-empty-function
      const bellSpy = vi.spyOn(output, "writeStdout").mockImplementation(() => {});

      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      // escape with no filter input should bell, not abort
      escape();
      expect(bellSpy).toHaveBeenCalled();

      bellSpy.mockRestore();

      enter();
      await expect(promise).resolves.toBe("foo");
    });

    it("enter submits currently highlighted filtered choice", async () => {
      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      type("qux");

      const rendered = lastRendered();
      expect(rendered).toContain("qux");
      expect(rendered).not.toContain("foo");

      enter();
      await expect(promise).resolves.toBe("qux");
    });

    it("arrow keys navigate within filtered results", async () => {
      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      // "ba" matches foobar, bar, baz (in original order)
      type("ba");

      // move down twice: foobar → bar → baz
      arrowDown();
      arrowDown();

      enter();
      await expect(promise).resolves.toBe("baz");
    });

    it("cursor resets to 0 when filter changes", async () => {
      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      // move down to second item
      arrowDown();

      // type a character — cursor should reset to 0
      type("q");

      enter();
      await expect(promise).resolves.toBe("qux");
    });

    it("space submits when search input is empty", async () => {
      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      space();
      await expect(promise).resolves.toBe("foo");
    });

    it("space is a search character when input is non-empty", async () => {
      const promise = startSelect({
        choices: ["my app", "my thing", "other"],
        searchable: true,
        content: "Pick one",
      });

      type("my");
      space();
      type("app");

      const rendered = lastRendered();
      expect(rendered).toContain("my app");
      expect(rendered).not.toContain("my thing");
      expect(rendered).not.toContain("other");

      enter();
      await expect(promise).resolves.toBe("my app");
    });

    it("submit with no matches bells", async () => {
      // oxlint-disable-next-line no-empty-function
      const bellSpy = vi.spyOn(output, "writeStdout").mockImplementation(() => {});

      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      type("zzzzz");

      const rendered = lastRendered();
      expect(rendered).toContain("No matches found");

      // try to submit — should bell, not submit
      enter();

      // verify bell was called (beep character)
      expect(bellSpy).toHaveBeenCalled();

      bellSpy.mockRestore();

      // clean up: escape clears filter, then submit
      escape();
      enter();
      await expect(promise).resolves.toBe("foo");
    });

    it('shows "Type to filter" hint', async () => {
      const promise = startSelect({
        choices,
        searchable: true,
        content: "Pick one",
      });

      const rendered = lastRendered();
      expect(rendered).toContain("Type to filter, arrow keys to move");
      expect(rendered).not.toContain("Use arrow keys to move");

      enter();
      await expect(promise).resolves.toBe("foo");
    });
  });

  describe("searchable grouped choices", () => {
    const groupedChoices: [string, string[]][] = [
      ["Team A", ["foo", "foobar"]],
      ["Team B", ["bar", "baz"]],
    ];

    it("group headers appear for matching choices", async () => {
      const promise = startSelect({
        groupedChoices,
        searchable: true,
        content: "Pick one",
      });

      type("fo");

      const rendered = lastRendered();
      expect(rendered).toContain("Team A");
      expect(rendered).toContain("foo");
      expect(rendered).toContain("foobar");
      expect(rendered).not.toContain("Team B");
      expect(rendered).not.toContain("baz");

      enter();
      await expect(promise).resolves.toBe("foo");
    });

    it("all groups shown when filter is empty", async () => {
      const promise = startSelect({
        groupedChoices,
        searchable: true,
        content: "Pick one",
      });

      const rendered = lastRendered();
      expect(rendered).toContain("Team A");
      expect(rendered).toContain("Team B");

      enter();
      await expect(promise).resolves.toBe("foo");
    });

    it("filter across multiple groups", async () => {
      // "ba" matches "foobar" from Team A AND "bar", "baz" from Team B
      const promise = startSelect({
        groupedChoices,
        searchable: true,
        content: "Pick one",
      });

      type("ba");

      const rendered = lastRendered();
      expect(rendered).toContain("Team A");
      expect(rendered).toContain("foobar");
      expect(rendered).toContain("Team B");
      expect(rendered).toContain("bar");
      expect(rendered).toContain("baz");
      // "foo" alone should not appear (doesn't contain "ba")
      // but "foobar" does, so check we don't have standalone "foo" rendered
      // (we can't easily distinguish "foo" from "foobar" in text, so just verify groups)

      enter();
      await expect(promise).resolves.toBe("foobar");
    });
  });

  describe("non-searchable mode (regression)", () => {
    const choices = ["alpha", "beta", "gamma"];

    it("characters are ignored in non-searchable mode", async () => {
      const promise = startSelect({
        choices,
        content: "Pick one",
      });

      const beforeCount = updatePromptCalls.length;

      type("a");

      // no new render calls should have been made
      expect(updatePromptCalls.length).toBe(beforeCount);

      enter();
      await expect(promise).resolves.toBe("alpha");
    });

    it("space still submits in non-searchable mode", async () => {
      const promise = startSelect({
        choices,
        content: "Pick one",
      });

      space();
      await expect(promise).resolves.toBe("alpha");
    });

    it("no filter UI in non-searchable mode", async () => {
      const promise = startSelect({
        choices,
        content: "Pick one",
      });

      const rendered = lastRendered();
      expect(rendered).toContain("Use arrow keys to move");
      expect(rendered).not.toContain("Type to filter");

      enter();
      await expect(promise).resolves.toBe("alpha");
    });

    it("arrow keys navigate in non-searchable mode", async () => {
      const promise = startSelect({
        choices,
        content: "Pick one",
      });

      arrowDown();
      enter();
      await expect(promise).resolves.toBe("beta");
    });

    it("arrow up wraps around in non-searchable mode", async () => {
      const promise = startSelect({
        choices,
        content: "Pick one",
      });

      arrowUp();
      enter();
      await expect(promise).resolves.toBe("gamma");
    });
  });

  describe("control character handling", () => {
    it("unhandled ctrl combos do not pollute search input", async () => {
      // oxlint-disable-next-line no-empty-function
      vi.spyOn(output, "writeStdout").mockImplementation(() => {});

      const promise = startSelect({
        choices: ["foo", "bar"],
        searchable: true,
        content: "Pick one",
      });

      // Ctrl+B sends \x02 as str, should be ignored
      simulateKeypress("\x02", "b", { ctrl: true });
      // Ctrl+F sends \x06 as str, should be ignored
      simulateKeypress("\x06", "f", { ctrl: true });

      // all choices should still be visible (no filter applied)
      const rendered = lastRendered();
      expect(rendered).toContain("foo");
      expect(rendered).toContain("bar");
      expect(rendered).not.toContain("No matches found");

      vi.restoreAllMocks();

      enter();
      await expect(promise).resolves.toBe("foo");
    });
  });
});
