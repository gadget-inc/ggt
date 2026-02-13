import chalk from "chalk";
import { describe, expect, it } from "vitest";

import { print } from "../../../src/services/output/print.js";
import { printTable } from "../../../src/services/output/table.js";
import { withEnv } from "../../__support__/env.js";
import { expectStdout } from "../../__support__/output.js";

describe("print", () => {
  it("prints to stdout", () => {
    const result: unknown = print("Hello, world!");
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
        "        {bold Hello, world!}
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

  it("prints json when GGT_LOG_FORMAT=json", () => {
    withEnv({ GGT_LOG_FORMAT: "json" }, () => {
      print({ content: "Hello, world!", json: { hello: "world" } });
      expectStdout().toMatchInlineSnapshot(`
        "{"hello":"world"}
        "
      `);
    });
  });

  describe("with ensureNewLine", () => {
    it("adds a newline after the content", () => {
      print({ ensureNewLine: true, content: "Hello, world!" });
      expectStdout().toMatchInlineSnapshot(`
        "Hello, world!
        "
      `);
    });

    it("does not add a newline after the content when the content already ends with a newline", () => {
      print({ ensureNewLine: true, content: "Hello, world!\n" });
      expectStdout().toMatchInlineSnapshot(`
        "Hello, world!
        "
      `);
    });
  });

  describe("with ensureEmptyLineAbove", () => {
    it("adds a newline before the content", () => {
      print({ ensureEmptyLineAbove: true, content: "Hello, world!" });
      expectStdout().toMatchInlineSnapshot('"Hello, world!"');
    });

    it("does not add a newline before the content when the content already begins with a newline", () => {
      print({ ensureEmptyLineAbove: true, content: "\nHello, world!" });
      expectStdout().toMatchInlineSnapshot('"Hello, world!"');
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
    expectStdout().toMatchInlineSnapshot(`
      "Table Title
      Column 1         Column 2
      Row 1, Column 1  Row 1, Column 2
      Row 2, Column 1  Row 2, Column 2
      Table Footer
      "
    `);
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
    expectStdout().toMatchInlineSnapshot(`
      "Table Title
      Column 1         Column 2
      Row 1, Column 1  Row 1, Column 2
      Row 2, Column 1  Row 2, Column 2
      "
    `);
  });

  it("writes a table with none borders to stdout", () => {
    printTable({
      borders: "none",
      title: "Table Title",
      headers: ["Column 1", "Column 2"],
      rows: [
        ["Row 1, Column 1", "Row 1, Column 2"],
        ["Row 2, Column 1", "Row 2, Column 2"],
      ],
      footer: "Table Footer",
    });
    expectStdout().toMatchInlineSnapshot(`
      "Table Title
      Column 1         Column 2
      Row 1, Column 1  Row 1, Column 2
      Row 2, Column 1  Row 2, Column 2
      Table Footer
      "
    `);
  });

  it("writes a table with thin borders to stdout", () => {
    printTable({
      borders: "thin",
      title: "Table Title",
      headers: ["Column 1", "Column 2"],
      rows: [
        ["Row 1, Column 1", "Row 1, Column 2"],
        ["Row 2, Column 1", "Row 2, Column 2"],
      ],
      footer: "Table Footer",
    });
    expectStdout().toMatchInlineSnapshot(`
      "Table Title
      ┌─────────────────┬─────────────────┐
      │ Column 1        │ Column 2        │
      ├─────────────────┼─────────────────┤
      │ Row 1, Column 1 │ Row 1, Column 2 │
      ├─────────────────┼─────────────────┤
      │ Row 2, Column 1 │ Row 2, Column 2 │
      └─────────────────┴─────────────────┘
      Table Footer
      "
    `);
  });

  it("writes a table with thick borders to stdout", () => {
    printTable({
      borders: "thick",
      title: "Table Title",
      headers: ["Column 1", "Column 2"],
      rows: [
        ["Row 1, Column 1", "Row 1, Column 2"],
        ["Row 2, Column 1", "Row 2, Column 2"],
      ],
      footer: "Table Footer",
    });
    expectStdout().toMatchInlineSnapshot(`
      "Table Title
      ╔═════════════════╤═════════════════╗
      ║ Column 1        │ Column 2        ║
      ╟─────────────────┼─────────────────╢
      ║ Row 1, Column 1 │ Row 1, Column 2 ║
      ╟─────────────────┼─────────────────╢
      ║ Row 2, Column 1 │ Row 2, Column 2 ║
      ╚═════════════════╧═════════════════╝
      Table Footer
      "
    `);
  });

  it("writes a table with indent", () => {
    printTable({
      title: "Table Title",
      headers: ["Column 1", "Column 2"],
      rows: [["Row 1, Column 1", "Row 1, Column 2"]],
      indent: 2,
    });
    expectStdout().toMatchInlineSnapshot(`
      "Table Title
        Column 1         Column 2
        Row 1, Column 1  Row 1, Column 2
      "
    `);
  });

  it("writes a table with ensureEmptyLineAboveBody", () => {
    printTable({
      title: "Table Title",
      headers: ["Column 1", "Column 2"],
      rows: [["Row 1, Column 1", "Row 1, Column 2"]],
      ensureEmptyLineAboveBody: true,
    });
    expectStdout().toMatchInlineSnapshot(`
      "Table Title

      Column 1         Column 2
      Row 1, Column 1  Row 1, Column 2
      "
    `);
  });

  it("writes a table with ensureEmptyLineAboveFooter", () => {
    printTable({
      title: "Table Title",
      headers: ["Column 1", "Column 2"],
      rows: [["Row 1, Column 1", "Row 1, Column 2"]],
      footer: "Table Footer",
      ensureEmptyLineAboveFooter: true,
    });
    expectStdout().toMatchInlineSnapshot(`
      "Table Title
      Column 1         Column 2
      Row 1, Column 1  Row 1, Column 2

      Table Footer
      "
    `);
  });

  it("writes a table with colAligns and colWidths", () => {
    printTable({
      headers: ["Left", "Right"],
      rows: [["A", "B"]],
      colAligns: ["left", "right"],
      colWidths: [10, 10],
    });
    expectStdout().toMatchInlineSnapshot(`
      "Left         Right
      A                B
      "
    `);
  });

  it("writes a table without headers", () => {
    printTable({
      rows: [
        ["Row 1, Column 1", "Row 1, Column 2"],
        ["Row 2, Column 1", "Row 2, Column 2"],
      ],
    });
    expectStdout().toMatchInlineSnapshot(`
      "Row 1, Column 1  Row 1, Column 2
      Row 2, Column 1  Row 2, Column 2
      "
    `);
  });
});
