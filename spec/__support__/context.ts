import { beforeEach } from "vitest";
import { Context } from "../../src/services/command/context.js";

/**
 * A {@linkcode Context} that is set up before each test.
 */
export let testCtx: Context;

/**
 * Sets up the test context before each test.
 */
export const mockContext = (): void => {
  beforeEach(() => {
    testCtx = Context.init({ name: "test" });
    return () => {
      testCtx.abort();
    };
  });
};
