import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("env", () => {
  const originalEnv = process.env["GGT_ENV"];

  beforeEach(() => {
    // Clear the module cache to get fresh env object
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["GGT_ENV"] = originalEnv;
    } else {
      delete process.env["GGT_ENV"];
    }
  });

  describe("value", () => {
    it("returns GGT_ENV when set", async () => {
      process.env["GGT_ENV"] = "staging";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.value).toBe("staging");
    });

    it("defaults to production when GGT_ENV is not set", async () => {
      delete process.env["GGT_ENV"];
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.value).toBe("production");
    });
  });

  describe("productionLike", () => {
    it("returns true for production", async () => {
      process.env["GGT_ENV"] = "production";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.productionLike).toBe(true);
    });

    it("returns true for staging (non-development, non-test)", async () => {
      process.env["GGT_ENV"] = "staging";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.productionLike).toBe(true);
    });

    it("returns false for development", async () => {
      process.env["GGT_ENV"] = "development";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.productionLike).toBe(false);
    });

    it("returns false for test", async () => {
      process.env["GGT_ENV"] = "test";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.productionLike).toBe(false);
    });
  });

  describe("developmentLike", () => {
    it("returns true for development", async () => {
      process.env["GGT_ENV"] = "development";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.developmentLike).toBe(true);
    });

    it("returns true for development-local", async () => {
      process.env["GGT_ENV"] = "development-local";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.developmentLike).toBe(true);
    });

    it("returns false for production", async () => {
      process.env["GGT_ENV"] = "production";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.developmentLike).toBe(false);
    });

    it("returns false for test", async () => {
      process.env["GGT_ENV"] = "test";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.developmentLike).toBe(false);
    });
  });

  describe("testLike", () => {
    it("returns true for test", async () => {
      process.env["GGT_ENV"] = "test";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.testLike).toBe(true);
    });

    it("returns true for test-integration", async () => {
      process.env["GGT_ENV"] = "test-integration";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.testLike).toBe(true);
    });

    it("returns false for production", async () => {
      process.env["GGT_ENV"] = "production";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.testLike).toBe(false);
    });

    it("returns false for development", async () => {
      process.env["GGT_ENV"] = "development";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.testLike).toBe(false);
    });
  });

  describe("developmentOrTestLike", () => {
    it("returns true for development", async () => {
      process.env["GGT_ENV"] = "development";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.developmentOrTestLike).toBe(true);
    });

    it("returns true for test", async () => {
      process.env["GGT_ENV"] = "test";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.developmentOrTestLike).toBe(true);
    });

    it("returns false for production", async () => {
      process.env["GGT_ENV"] = "production";
      const { env } = await import("../../../src/services/config/env.js");

      expect(env.developmentOrTestLike).toBe(false);
    });
  });
});
