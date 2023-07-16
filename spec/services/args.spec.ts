import { describe, expect, it } from "vitest";
import { App } from "../../src/services/args.js";
import { ArgError } from "../../src/services/errors.js";
import { getError } from "../util.js";

describe("args", () => {
  describe("App", () => {
    it.each([
      "my-app",
      "my-app.gadget.app",
      "my-app--development.gadget.app",
      "https://my-app.gadget.app",
      "https://my-app--development.gadget.app",
      "https://my-app.gadget.app/edit",
      "https://my-app.gadget.app/edit/files/routes/GET.js",
    ])("accepts %s", (value) => {
      expect(App(value, "app")).toEqual("my-app");
    });

    it.each(["~"])("rejects %s", async (value) => {
      const error = await getError(() => App(value, "app"));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatchSnapshot();
    });
  });
});
