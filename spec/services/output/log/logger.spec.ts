import { describe, it } from "vitest";

import { createLogger } from "../../../../src/services/output/log/logger.js";
import { withEnv } from "../../../__support__/env.js";
import { expectStderr, mockStderr } from "../../../__support__/output.js";
import { mockSystemTime } from "../../../__support__/time.js";

describe("createLogger", () => {
  mockStderr();
  mockSystemTime();

  it("creates a logger that logs to stderr", () => {
    const logger = createLogger({ name: "test-logger" });

    withEnv({ GGT_LOG_LEVEL: "info" }, () => {
      logger.info("hello world");
    });

    expectStderr().toMatchInlineSnapshot(`
      "12:00:00  INFO  test-logger: hello world
      "
    `);
  });

  describe("child", () => {
    it("inherits parent name when no child name provided", () => {
      const logger = createLogger({ name: "parent" });
      const child = logger.child({});

      withEnv({ GGT_LOG_LEVEL: "info" }, () => {
        child.info("from child");
      });

      expectStderr().toMatchInlineSnapshot(`
        "12:00:00  INFO  parent: from child
        "
      `);
    });

    it("overrides name when child name provided", () => {
      const logger = createLogger({ name: "parent" });
      const child = logger.child({ name: "child" });

      withEnv({ GGT_LOG_LEVEL: "info" }, () => {
        child.info("from child");
      });

      expectStderr().toMatchInlineSnapshot(`
        "12:00:00  INFO  child: from child
        "
      `);
    });

    it("merges parent and child fields", () => {
      const logger = createLogger({ name: "parent", fields: { parentField: "parent" } });
      const child = logger.child({ fields: { childField: "child" } });

      withEnv({ GGT_LOG_LEVEL: "info" }, () => {
        child.info("merged");
      });

      expectStderr().toMatchInlineSnapshot(`
        "12:00:00  INFO  parent: merged
          parentField: 'parent'
          childField: 'child'
        "
      `);
    });
  });
});
