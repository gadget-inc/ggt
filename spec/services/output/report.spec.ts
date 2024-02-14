import * as Sentry from "@sentry/node";
import { describe, expect, it, vi } from "vitest";
import { CLIError, IsBug, UnexpectedError, reportErrorAndExit } from "../../../src/services/output/report.js";
import { makeContext } from "../../__support__/context.js";
import { expectProcessExit } from "../../__support__/process.js";
import { expectStdout } from "../../__support__/stream.js";

describe("reportErrorAndExit", () => {
  it("renders and reports errors then exits", async () => {
    vi.spyOn(Sentry, "captureException");

    class TestError extends CLIError {
      override isBug = IsBug.MAYBE;

      constructor() {
        super("Boom!");
      }

      protected override render(): string {
        return this.message;
      }
    }

    const error = new TestError();

    await expectProcessExit(() => reportErrorAndExit(makeContext(), error), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Boom!

      If you think this is a bug, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);

    expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({ event_id: error.id }));
  });
});

describe("UnexpectedError", () => {
  it("renders correctly", () => {
    const cause = new Error("Whoops!");

    const error = new UnexpectedError(cause);
    expect(error.toString()).toMatch(
      /An unexpected error occurred\s+Error: Whoops![\s\S]*This is a bug, please submit an issue using the link below.\s+https:\/\/github.com\/gadget-inc\/ggt\/issues\/new\?template=bug_report\.yml&error-id=00000000-0000-0000-0000-000000000000/,
    );
  });
});
