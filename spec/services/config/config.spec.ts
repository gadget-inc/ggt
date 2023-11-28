import { beforeEach, describe, expect, it } from "vitest";
import { config } from "../../../src/services/config/config.js";

describe("domains", () => {
  beforeEach(() => {
    delete process.env["GGT_GADGET_APP_DOMAIN"];
    delete process.env["GGT_GADGET_SERVICES_DOMAIN"];
  });

  describe("app", () => {
    it("uses GGT_GADGET_APP_DOMAIN if set", () => {
      const domain = "test.example.com";
      process.env["GGT_GADGET_APP_DOMAIN"] = domain;
      expect(config.domains.app).toBe(domain);
    });

    it.each(["development", "test"])("defaults to ggt.pub when GGT_ENV=%s", (env) => {
      process.env["GGT_ENV"] = env;
      expect(config.domains.app).toBe("ggt.pub");
    });

    it("defaults to gadget.app otherwise", () => {
      for (const env of [undefined, "production", "blah"]) {
        process.env["GGT_ENV"] = env;
        expect(config.domains.app).toBe("gadget.app");
      }
    });
  });

  describe("services", () => {
    it("uses GGT_GADGET_SERVICES_DOMAIN if set", () => {
      const domain = "test.example.com";
      process.env["GGT_GADGET_SERVICES_DOMAIN"] = domain;
      expect(config.domains.services).toBe(domain);
    });

    it.each(["development", "test"])("defaults to app.ggt.dev when GGT_ENV=%s", (env) => {
      process.env["GGT_ENV"] = env;
      expect(config.domains.services).toBe("app.ggt.dev");
    });

    it("defaults to app.gadget.dev otherwise", () => {
      for (const env of [undefined, "production", "blah"]) {
        process.env["GGT_ENV"] = env;
        expect(config.domains.services).toBe("app.gadget.dev");
      }
    });
  });
});
