import { describe, expect, it } from "vitest";

import { isSprintOptions, sprint, sprintln } from "../../../src/services/output/sprint.js";

describe("sprint", () => {
  describe("string overload", () => {
    it("passes through a plain string as-is", () => {
      expect(sprint("Hello, world!")).toBe("Hello, world!");
    });

    it("does not dedent or apply chalk-template to plain strings", () => {
      const input = "  {bold not bold}  ";
      expect(sprint(input)).toBe(input);
    });
  });

  describe("template literal overload", () => {
    it("removes indentation from template strings", () => {
      const result = sprint`
        Hello, world!
        How are you?
      `;
      expect(result).toBe("Hello, world!\nHow are you?");
    });

    it("interpolates values", () => {
      const name = "Jane";
      const result = sprint`Hello, ${name}!`;
      expect(result).toBe("Hello, Jane!");
    });
  });

  describe("options overload", () => {
    it("returns the content string", () => {
      expect(sprint({ content: "Hello" })).toBe("Hello");
    });

    describe("ensureNewLine", () => {
      it("appends a newline when ensureNewLine is true", () => {
        expect(sprint({ content: "Hello", ensureNewLine: true })).toBe("Hello\n");
      });

      it("does not double-append when content already ends with a newline", () => {
        expect(sprint({ content: "Hello\n", ensureNewLine: true })).toBe("Hello\n");
      });

      it("defaults to false (no newline appended)", () => {
        expect(sprint({ content: "Hello" })).toBe("Hello");
      });
    });

    describe("ensureEmptyLineAbove", () => {
      it("prepends a newline when ensureEmptyLineAbove is true", () => {
        expect(sprint({ content: "Hello", ensureEmptyLineAbove: true })).toBe("\nHello");
      });

      it("does not double-prepend when content already starts with a newline", () => {
        expect(sprint({ content: "\nHello", ensureEmptyLineAbove: true })).toBe("\nHello");
      });

      it("defaults to false (no newline prepended)", () => {
        expect(sprint({ content: "Hello" })).toBe("Hello");
      });
    });

    describe("indent", () => {
      it("indents each line by the given number of spaces", () => {
        expect(sprint({ content: "line1\nline2", indent: 2 })).toBe("  line1\n  line2");
      });

      it("defaults to 0 (no indentation)", () => {
        expect(sprint({ content: "Hello" })).toBe("Hello");
      });
    });

    describe("boxen", () => {
      it("wraps content in a box", () => {
        const result = sprint({ content: "Hello", boxen: { padding: 0 } });
        expect(result).toContain("Hello");
        // boxen adds border characters
        expect(result).toContain("─");
      });
    });

    describe("combined options", () => {
      it("applies ensureEmptyLineAbove and ensureNewLine together", () => {
        const result = sprint({ content: "Hello", ensureEmptyLineAbove: true, ensureNewLine: true });
        expect(result).toBe("\nHello\n");
      });
    });
  });
});

describe("sprintln", () => {
  it("adds a newline to a plain string", () => {
    expect(sprintln("Hello")).toBe("Hello\n");
  });

  it("does not double-append newline", () => {
    expect(sprintln("Hello\n")).toBe("Hello\n");
  });

  it("adds a newline to template literal output", () => {
    const result = sprintln`Hello, world!`;
    expect(result).toBe("Hello, world!\n");
  });

  it("adds a newline to options-based output", () => {
    expect(sprintln({ content: "Hello" })).toBe("Hello\n");
  });

  it("respects ensureEmptyLineAbove with ensureNewLine", () => {
    expect(sprintln({ content: "Hello", ensureEmptyLineAbove: true })).toBe("\nHello\n");
  });
});

describe("isSprintOptions", () => {
  it("returns true for an options object", () => {
    expect(isSprintOptions({ ensureNewLine: true })).toBe(true);
  });

  it("returns false for a string", () => {
    expect(isSprintOptions("Hello")).toBe(false);
  });

  it("returns false for a TemplateStringsArray", () => {
    // TemplateStringsArray is an array, so isSprintOptions should return false
    const template = Object.assign(["Hello"], { raw: ["Hello"] }) as TemplateStringsArray;
    expect(isSprintOptions(template)).toBe(false);
  });
});
