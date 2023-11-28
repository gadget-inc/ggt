import chalk from "chalk";
import { describe, it, vi } from "vitest";
import { createPrinter } from "../../../../src/services/output/log/printer.js";
import { withEnv } from "../../../__support__/env.js";
import { expectStdout } from "../../../__support__/stdout.js";

describe("printer", () => {
  const printer = createPrinter({ name: "printer" });

  for (const method of ["print", "println", "printlns"] as const) {
    describe(method, () => {
      it("writes to stdout", () => {
        printer[method]("Hello, world!");
        expectStdout().toMatchSnapshot();
      });

      it("strips indentation from multiline strings", () => {
        printer[method](`
            Hello, world!
            I am a multiline string.
        `);
        expectStdout().toMatchSnapshot();
      });

      it("supports tagged template literals", () => {
        printer[method]`
            Hello, world!
            I am a multiline string.
        `;
        expectStdout().toMatchSnapshot();
      });

      it("supports chalk colors within template literals", () => {
        try {
          chalk.level = 3;
          printer[method]`
            {bold Hello, world!}
            {underline I am a multiline string.}
          `;
          expectStdout().toMatchSnapshot();
        } finally {
          chalk.level = 0;
        }
      });

      it("prints like a structured logger when GGT_LOG_LEVEL is set", () => {
        try {
          vi.useFakeTimers();
          vi.setSystemTime(0);

          withEnv({ GGT_LOG_LEVEL: "info" }, () => {
            printer[method]("Hello, world!");
            expectStdout().toMatchSnapshot();
          });
        } finally {
          vi.useRealTimers();
        }
      });

      it("prints json when GGT_LOG_FORMAT=json", () => {
        withEnv({ GGT_LOG_FORMAT: "json" }, () => {
          printer[method]("Hello, world!");
          expectStdout().toMatchSnapshot();
        });
      });
    });
  }

  describe("printTable", () => {
    it("writes a table to stdout", () => {
      printer.printTable({
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
      printer.printTable({
        message: "Table Title",
        headers: ["Column 1", "Column 2"],
        rows: [
          ["Row 1, Column 1", "Row 1, Column 2"],
          ["Row 2, Column 1", "Row 2, Column 2"],
        ],
      });
      expectStdout().toMatchSnapshot();
    });

    it("writes the table as json when GGT_LOG_FORMAT=json", () => {
      withEnv({ GGT_LOG_FORMAT: "json" }, () => {
        printer.printTable({
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
    });

    for (const borders of ["none", "thin", "thick"] as const) {
      it(`writes a table with ${borders} borders to stdout`, () => {
        printer.printTable({
          borders: borders,
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
});
