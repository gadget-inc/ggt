import chalk from "chalk";
import { describe, expect, it, vi } from "vitest";
import { print, printTable, sprint, sprintln } from "../../../src/services/output/print.js";
import { withEnv } from "../../__support__/env.js";
import { expectStdout } from "../../__support__/stream.js";

describe("print", () => {
  it("writes to stdout", () => {
    print("Hello, world!");
    expectStdout().toMatchInlineSnapshot('"Hello, world!"');
  });

  it("strips indentation from multiline strings", () => {
    print(`
        Hello, world!
        I am a multiline string.
    `);
    expectStdout().toMatchInlineSnapshot(`
      "Hello, world!
      I am a multiline string."
    `);
  });

  it("supports tagged template literals", () => {
    print`
        Hello, world!
        I am a multiline string.
    `;
    expectStdout().toMatchInlineSnapshot(`
      "Hello, world!
      I am a multiline string."
    `);
  });

  it("supports top padding", () => {
    print({ padTop: true })("Hello, world!");
    expectStdout().toMatchInlineSnapshot(`
      "
      Hello, world!"
    `);
  });

  it("supports chalk colors within template literals", () => {
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
      expectStdout().toMatchInlineSnapshot('"{\\"hello\\":\\"world\\"}"');
    });
  });
});

describe("printTable", () => {
  it("writes a table to stdout", () => {
    printTable({
      message: "Table Title",
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
      message: "Table Title",
      headers: ["Column 1", "Column 2"],
      rows: [
        ["Row 1, Column 1", "Row 1, Column 2"],
        ["Row 2, Column 1", "Row 2, Column 2"],
      ],
    });
    expectStdout().toMatchSnapshot();
  });

  //   it("writes the table as json when GGT_LOG_FORMAT=json", () => {
  //     withEnv({ GGT_LOG_FORMAT: "json" }, () => {
  //       printTable({
  //         message: "Table Title",
  //         headers: ["Column 1", "Column 2"],
  //         rows: [
  //           ["Row 1, Column 1", "Row 1, Column 2"],
  //           ["Row 2, Column 1", "Row 2, Column 2"],
  //         ],
  //         footer: "Table Footer",
  //       });
  //       expectStdout().toMatchSnapshot();
  //     });
  //   });

  for (const borders of ["none", "thin", "thick"] as const) {
    it(`writes a table with ${borders} borders to stdout`, () => {
      printTable({
        borders,
        message: "Table Title",
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

describe("sprint", () => {
  it("accepts a string", () => {
    const result = sprint("hello");
    expect(result).toBe("hello");
  });

  it("accepts a template", () => {
    const world = "world";
    const result = sprint`hello ${world}`;
    expect(result).toBe("hello world");
  });

  it("adds top padding", () => {
    const result = sprint({ padTop: true })("hello");
    expect(result).toBe("\nhello");
  });
});

describe("sprintln", () => {
  it("accepts a string", () => {
    const result = sprintln("hello");
    expect(result).toBe("hello\n");
  });

  it("accepts a template", () => {
    const world = "world";
    const result = sprintln`hello ${world}`;
    expect(result).toBe("hello world\n");
  });

  it("adds top padding", () => {
    const result = sprintln({ padTop: true })("hello");
    expect(result).toBe("\nhello\n");
  });
});
