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
    expect(error.toString()).toMatchInlineSnapshot(`
      "An unexpected error occurred

      Error: Whoops!
          at spec/services/output/report.spec.ts:43:19
          at node_modules/@vitest/runner/dist/index.js:135:14
          at node_modules/@vitest/runner/dist/index.js:58:26
          at runTest (node_modules/@vitest/runner/dist/index.js:663:17)
          at runSuite (node_modules/@vitest/runner/dist/index.js:782:15)
          at runSuite (node_modules/@vitest/runner/dist/index.js:782:15)
          at runFiles (node_modules/@vitest/runner/dist/index.js:834:5)
          at startTests (node_modules/@vitest/runner/dist/index.js:843:3)
          at node_modules/vitest/dist/entry.js:103:7
          at withEnv (node_modules/vitest/dist/entry.js:73:5)

      This is a bug, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000"
    `);
  });
});
