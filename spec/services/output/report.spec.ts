import * as Sentry from "@sentry/node";
import { describe, expect, it, vi } from "vitest";
import { CLIError, IsBug, UnexpectedError, reportErrorAndExit } from "../../../src/services/output/report.js";
import { makeContext } from "../../__support__/context.js";
import { expectStdout } from "../../__support__/output.js";
import { expectProcessExit } from "../../__support__/process.js";

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

      If you think this is a bug, use the link below to create an issue on GitHub.

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
    expect(error.sprint()).toMatchInlineSnapshot(`
      "An unexpected error occurred.

      Error: Whoops!
          at spec/services/output/report.spec.ts:43:19
          at node_modules/@vitest/runner/dist/index.js:134:14
          at node_modules/@vitest/runner/dist/index.js:59:26
          at runTest (node_modules/@vitest/runner/dist/index.js:719:17)
          at runSuite (node_modules/@vitest/runner/dist/index.js:847:15)
          at runSuite (node_modules/@vitest/runner/dist/index.js:847:15)
          at runFiles (node_modules/@vitest/runner/dist/index.js:896:5)
          at startTests (node_modules/@vitest/runner/dist/index.js:905:3)
          at node_modules/vitest/dist/chunks/runtime-runBaseTests.9RbsHRbU.js:114:7
          at withEnv (node_modules/vitest/dist/chunks/runtime-runBaseTests.9RbsHRbU.js:82:5)

      This is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });
});
