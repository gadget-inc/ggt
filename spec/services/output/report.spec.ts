import { describe, expect, it } from "vitest";
import { GGTError, IsBug, UnexpectedError, reportErrorAndExit } from "../../../src/services/output/report.js";
import { testCtx } from "../../__support__/context.js";
import { expectStdout } from "../../__support__/output.js";
import { expectProcessExit } from "../../__support__/process.js";

describe("reportErrorAndExit", () => {
  it("renders and reports errors then exits", async () => {
    // Cannot redefine property: captureException
    // vi.spyOn(Sentry, "captureException");

    class TestError extends GGTError {
      override isBug = IsBug.MAYBE;

      constructor() {
        super("Boom!");
      }

      protected override render(): string {
        return this.message;
      }
    }

    const error = new TestError();

    await expectProcessExit(() => reportErrorAndExit(testCtx, error), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Boom!

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);

    // expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({ event_id: error.id }));
  });
});

describe("UnexpectedError", () => {
  it("renders correctly", () => {
    const cause = new Error("Whoops!");

    const error = new UnexpectedError(cause);
    const rendered = error
      .sprint()
      // replace node_module stack lines with "at ..."
      .replace(/at .*node_modules.*$/gm, "at ...")
      // replace sequential "at ..." lines into a single line
      .replace(/at \.\.\.(\n\s*at \.\.\.)+/g, "at ...");

    expect(rendered).toMatchInlineSnapshot(`
      "An unexpected error occurred.

      Error: Whoops!
          at spec/services/output/report.spec.ts:43:19
          at ...

      This is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });
});
