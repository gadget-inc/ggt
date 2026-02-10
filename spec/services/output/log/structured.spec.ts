import * as Sentry from "@sentry/node";
import { describe, expect, it, vi } from "vitest";

import { createStructuredLogger } from "../../../../src/services/output/log/structured.js";
import { withEnv } from "../../../__support__/env.js";
import { expectStderr, mockStderr } from "../../../__support__/output.js";
import { mockSystemTime } from "../../../__support__/time.js";

describe("structured", () => {
  mockStderr();
  mockSystemTime();

  it("logs the expected output when GGT_LOG_LEVEL=trace", () => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "trace" }, () => {
      structuredLogger.trace("trace");
      structuredLogger.debug("debug");
      structuredLogger.info("info");
      structuredLogger.warn("warn");
      structuredLogger.error("error");
    });

    expectStderr().toMatchInlineSnapshot(`
      "12:00:00  TRACE  structured: trace
      12:00:00  DEBUG  structured: debug
      12:00:00  INFO  structured: info
      12:00:00  WARN  structured: warn
      12:00:00  ERROR  structured: error
      "
    `);
  });

  it("logs the expected output when GGT_LOG_LEVEL=debug", () => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "debug" }, () => {
      structuredLogger.trace("trace");
      structuredLogger.debug("debug");
      structuredLogger.info("info");
      structuredLogger.warn("warn");
      structuredLogger.error("error");
    });

    expectStderr().toMatchInlineSnapshot(`
      "12:00:00  DEBUG  structured: debug
      12:00:00  INFO  structured: info
      12:00:00  WARN  structured: warn
      12:00:00  ERROR  structured: error
      "
    `);
  });

  it("logs the expected output when GGT_LOG_LEVEL=info", () => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "info" }, () => {
      structuredLogger.trace("trace");
      structuredLogger.debug("debug");
      structuredLogger.info("info");
      structuredLogger.warn("warn");
      structuredLogger.error("error");
    });

    expectStderr().toMatchInlineSnapshot(`
      "12:00:00  INFO  structured: info
      12:00:00  WARN  structured: warn
      12:00:00  ERROR  structured: error
      "
    `);
  });

  it("logs the expected output when GGT_LOG_LEVEL=warn", () => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "warn" }, () => {
      structuredLogger.trace("trace");
      structuredLogger.debug("debug");
      structuredLogger.info("info");
      structuredLogger.warn("warn");
      structuredLogger.error("error");
    });

    expectStderr().toMatchInlineSnapshot(`
      "12:00:00  WARN  structured: warn
      12:00:00  ERROR  structured: error
      "
    `);
  });

  it("logs the expected output when GGT_LOG_LEVEL=error", () => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "error" }, () => {
      structuredLogger.trace("trace");
      structuredLogger.debug("debug");
      structuredLogger.info("info");
      structuredLogger.warn("warn");
      structuredLogger.error("error");
    });

    expectStderr().toMatchInlineSnapshot(`
      "12:00:00  ERROR  structured: error
      "
    `);
  });

  // Cannot redefine property: addBreadcrumb
  it("adds the expected logs to sentry breadcrumbs", { skip: true }, () => {
    vi.spyOn(Sentry, "addBreadcrumb");

    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "trace" }, () => {
      structuredLogger.trace("trace");
      structuredLogger.debug("debug");
      structuredLogger.info("info");
      structuredLogger.warn("warn");
      structuredLogger.error("error");
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(3);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({ level: "log", message: "info", data: {} });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({ level: "log", message: "warn", data: {} });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({ level: "log", message: "error", data: {} });
  });

  it("merges logger and message fields", () => {
    withEnv({ GGT_LOG_LEVEL: "trace" }, () => {
      const structuredLogger = createStructuredLogger({ name: "structured", fields: { logger: true, field: "logger" } });
      structuredLogger.trace("first message");
      expectStderr().toMatchInlineSnapshot(`
        "12:00:00  TRACE  structured: first message
          logger: true
          field: 'logger'
        "
      `);

      structuredLogger.trace("second message", { message: true, field: "message" });
      expectStderr().toMatchInlineSnapshot(`
        "12:00:00  TRACE  structured: first message
          logger: true
          field: 'logger'
        12:00:00  TRACE  structured: second message
          logger: true
          field: 'message'
          message: true
        "
      `);
    });
  });

  it("prints dev fields in development", () => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "trace", GGT_ENV: "development" }, () => {
      structuredLogger.trace("trace", {}, { dev: true });
      structuredLogger.debug("debug", {}, { dev: true });
      structuredLogger.info("info", {}, { dev: true });
      structuredLogger.warn("warn", {}, { dev: true });
      structuredLogger.error("error", {}, { dev: true });
    });

    expectStderr().toMatchInlineSnapshot(`
      "12:00:00  TRACE  structured: trace
        dev: true
      12:00:00  DEBUG  structured: debug
        dev: true
      12:00:00  INFO  structured: info
        dev: true
      12:00:00  WARN  structured: warn
        dev: true
      12:00:00  ERROR  structured: error
        dev: true
      "
    `);
  });

  it("prints dev fields in test", () => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "trace", GGT_ENV: "test" }, () => {
      structuredLogger.trace("trace", {}, { dev: true });
      structuredLogger.debug("debug", {}, { dev: true });
      structuredLogger.info("info", {}, { dev: true });
      structuredLogger.warn("warn", {}, { dev: true });
      structuredLogger.error("error", {}, { dev: true });
    });

    expectStderr().toMatchInlineSnapshot(`
      "12:00:00  TRACE  structured: trace
        dev: true
      12:00:00  DEBUG  structured: debug
        dev: true
      12:00:00  INFO  structured: info
        dev: true
      12:00:00  WARN  structured: warn
        dev: true
      12:00:00  ERROR  structured: error
        dev: true
      "
    `);
  });

  it("does not print dev fields in production", () => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "trace", GGT_ENV: "production" }, () => {
      structuredLogger.trace("trace", {}, { dev: true });
      structuredLogger.debug("debug", {}, { dev: true });
      structuredLogger.info("info", {}, { dev: true });
      structuredLogger.warn("warn", {}, { dev: true });
      structuredLogger.error("error", {}, { dev: true });
    });

    expectStderr().toMatchInlineSnapshot(`
      "12:00:00  TRACE  structured: trace
      12:00:00  DEBUG  structured: debug
      12:00:00  INFO  structured: info
      12:00:00  WARN  structured: warn
      12:00:00  ERROR  structured: error
      "
    `);
  });

  it("prints json when GGT_LOG_FORMAT=json", () => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "trace", GGT_LOG_FORMAT: "json" }, () => {
      structuredLogger.trace("trace");
      structuredLogger.debug("debug");
      structuredLogger.info("info");
      structuredLogger.warn("warn");
      structuredLogger.error("error");
    });

    expectStderr().toMatchInlineSnapshot(`
      "{"level":1,"name":"structured","msg":"trace","fields":{}}
      {"level":2,"name":"structured","msg":"debug","fields":{}}
      {"level":3,"name":"structured","msg":"info","fields":{}}
      {"level":4,"name":"structured","msg":"warn","fields":{}}
      {"level":5,"name":"structured","msg":"error","fields":{}}
      "
    `);
  });
});
