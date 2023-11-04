import { describe, expect, it } from "vitest";
import { AppArg, parseBoolean } from "../../src/services/args.js";
import { ArgError } from "../../src/services/errors.js";
import { expectError } from "../__support__/error.js";

describe("args", () => {
  describe("parseBoolean", () => {
    it.each(["1", "true", "True", "TRUE"])("parses %s as true", (value) => {
      expect(parseBoolean(value)).toBe(true);
    });

    it.each(["0", "false", "False", "FALSE"])("parses %s as false", (value) => {
      expect(parseBoolean(value)).toBe(false);
    });
  });

  describe("AppArg", () => {
    it.each([
      "my-app",
      "my-app.gadget.app",
      "my-app--development.gadget.app",
      "https://my-app.gadget.app",
      "https://my-app--development.gadget.app",
      "https://my-app.gadget.app/edit",
      "https://my-app.gadget.app/edit/files/routes/GET.js",
    ])("accepts %s", (value) => {
      expect(AppArg(value, "app")).toEqual("my-app");
    });

    it.each(["~"])("rejects %s", async (value) => {
      const error = await expectError(() => AppArg(value, "app"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchSnapshot();
    });
  });
});
