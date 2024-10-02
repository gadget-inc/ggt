import * as Sentry from "@sentry/node";
import { describe, expect, it, vi } from "vitest";
import { createStructuredLogger } from "../../../../src/services/output/log/structured.js";
import { withEnv } from "../../../__support__/env.js";
import { expectStderr, mockStderr } from "../../../__support__/output.js";
import { mockSystemTime } from "../../../__support__/time.js";

describe("structured", () => {
  mockStderr();
  mockSystemTime();

  it.each(["trace", "debug", "info", "warn", "error"])("logs the expected output when GGT_LOG_LEVEL=%s", (level) => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: level }, () => {
      structuredLogger.trace("trace");
      structuredLogger.debug("debug");
      structuredLogger.info("info");
      structuredLogger.warn("warn");
      structuredLogger.error("error");
    });

    expectStderr().toMatchSnapshot();
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

  it.each(["development", "test"])("prints dev fields in %s", (name) => {
    const structuredLogger = createStructuredLogger({ name: "structured" });

    withEnv({ GGT_LOG_LEVEL: "trace", GGT_ENV: name }, () => {
      structuredLogger.trace("trace", {}, { dev: true });
      structuredLogger.debug("debug", {}, { dev: true });
      structuredLogger.info("info", {}, { dev: true });
      structuredLogger.warn("warn", {}, { dev: true });
      structuredLogger.error("error", {}, { dev: true });
    });

    expectStderr().toMatchSnapshot();
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

    expectStderr().toMatchSnapshot();
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

    expectStderr().toMatchSnapshot();
  });
});
