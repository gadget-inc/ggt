import chalk from "chalk";
import type { Ora } from "ora";
import { describe, expect, it, vi } from "vitest";
import { print, printTable } from "../../../src/services/output/print.js";
import { withEnv } from "../../__support__/env.js";
import { expectStdout } from "../../__support__/output.js";

describe("print", () => {
  it("prints to stdout", () => {
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-invalid-void-type
    const result: void = print("Hello, world!");
    expectStdout().toMatchInlineSnapshot('"Hello, world!"');
    expect(result).toBeUndefined();
  });

  it("prints strings as is", () => {
    try {
      chalk.level = 3;
      print(`
        {bold Hello, world!}
        {underline I am a multiline string.}
      `);
      expectStdout().toMatchInlineSnapshot(`
        "
                {bold Hello, world!}
                {underline I am a multiline string.}
              "
      `);
    } finally {
      chalk.level = 0;
    }
  });

  it("prints tagged template literal without indentation", () => {
    print`
        Hello, world!
        I am a multiline string.
    `;
    expectStdout().toMatchInlineSnapshot(`
      "Hello, world!
      I am a multiline string."
    `);
  });

  it("prints tagged template literal with chalk colors", () => {
    try {
      chalk.level = 3;
      print`
        {bold Hello, world!}
        {underline I am a multiline string.}
      `;
      expectStdout().toMatchInlineSnapshot(`
        "[1mHello, world![22m
        [4mI am a multiline string.[24m"
      `);
    } finally {
      chalk.level = 0;
    }
  });

  it("prints like a structured logger when GGT_LOG_LEVEL is set", () => {
    try {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      withEnv({ GGT_LOG_LEVEL: "info" }, () => {
        print("Hello, world!");
        expectStdout().toMatchInlineSnapshot(`
          "12:00:00 PRINT : Hello, world!
          "
        `);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("prints json when GGT_LOG_FORMAT=json", () => {
    withEnv({ GGT_LOG_FORMAT: "json" }, () => {
      print({ json: { hello: "world" } })("Hello, world!");
      expectStdout().toMatchInlineSnapshot(`
        "{\\"hello\\":\\"world\\"}
        "
      `);
    });
  });

  describe("with ensureNewLine", () => {
    it("adds a newline after the content", () => {
      print({ ensureNewLine: true })("Hello, world!");
      expectStdout().toMatchInlineSnapshot(`
        "Hello, world!
        "
      `);
    });

    it("does not add a newline after the content when the content already ends with a newline", () => {
      print({ ensureNewLine: true })("Hello, world!\n");
      expectStdout().toMatchInlineSnapshot(`
        "Hello, world!
        "
      `);
    });
  });

  describe("with ensureEmptyLineAbove", () => {
    it("adds a newline before the content", () => {
      print({ ensureEmptyLineAbove: true })("Hello, world!");
      expectStdout().toMatchInlineSnapshot(`
      "
      Hello, world!"
    `);
    });

    it("does not add a newline before the content when the content already begins with a newline", () => {
      print({ ensureEmptyLineAbove: true })("\nHello, world!");
      expectStdout().toMatchInlineSnapshot(`
      "
      Hello, world!"
    `);
    });
  });

  describe('{ output: "string" }', () => {
    it("returns the formatted string instead of printing it", () => {
      const result: string = print({ output: "string" })("Hello, world!");
      expect(result).toMatchInlineSnapshot('"Hello, world!"');
    });
  });

  describe('{ output: "spinner" }', () => {
    it("prints a spinner", () => {
      const spinner: Ora = print({ output: "spinner" })("Hello, world!");
      expect(spinner.text).toBe("Hello, world!");
    });
  });
});

describe("printTable", () => {
  it("writes a table to stdout", () => {
    printTable({
      title: "Table Title",
      headers: ["Column 1", "Column 2"],
      rows: [
        ["Row 1, Column 1", "Row 1, Column 2"],
        ["Row 2, Column 1", "Row 2, Column 2"],
      ],
      footer: "Table Footer",
    });
    expectStdout().toMatchSnapshot();
  });

  it("writes a table with without a footer to stdout", () => {
    printTable({
      title: "Table Title",
      headers: ["Column 1", "Column 2"],
      rows: [
        ["Row 1, Column 1", "Row 1, Column 2"],
        ["Row 2, Column 1", "Row 2, Column 2"],
      ],
    });
    expectStdout().toMatchSnapshot();
  });

  for (const borders of ["none", "thin", "thick"] as const) {
    it(`writes a table with ${borders} borders to stdout`, () => {
      printTable({
        borders,
        title: "Table Title",
        headers: ["Column 1", "Column 2"],
        rows: [
          ["Row 1, Column 1", "Row 1, Column 2"],
          ["Row 2, Column 1", "Row 2, Column 2"],
        ],
        footer: "Table Footer",
      });
      expectStdout().toMatchSnapshot();
    });
  }
});
