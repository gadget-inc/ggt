import { context } from "../../src/utils/context";
import { FlagError } from "../../src/utils/errors";
import { app } from "../../src/utils/flags";
import { getError } from "../util";

describe("flags", () => {
  describe("-a, --app", () => {
    beforeEach(() => {
      jest.spyOn(context, "getAvailableApps").mockResolvedValue([{ id: "1", name: "MyApp", slug: "my-app", hasSplitEnvironments: true }]);
    });

    it.each([
      "MyApp",
      "my-app",
      "my-app.gadget.app",
      "my-app--development.gadget.app",
      "https://my-app.gadget.app",
      "https://my-app--development.gadget.app",
      "https://my-app.gadget.app/edit",
      "https://my-app.gadget.app/edit/files/routes/GET.js",
    ])("accepts %s", async (value) => {
      await expect(app().parse(value, {} as any, {} as any)).resolves.toEqual("my-app");
    });

    it.each(["~"])("rejects %s", async (value) => {
      const error = await getError(() => app().parse(value, {} as any, {} as any));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.description).toStartWith("The -a, --app flag must be the application's name, slug, or URL");
    });

    it("does not accept an app that doesn't exist or the user doesn't have access to", async () => {
      const error = await getError(() => app().parse("unknown-app", {} as any, {} as any));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.description).toMatchInlineSnapshot(`
        "Unknown application:

          unknown-app

        Did you mean one of these?

          * my-app"
      `);
    });

    it("informs the user if they don't have any apps", async () => {
      jest.spyOn(context, "getAvailableApps").mockResolvedValue([]);
      const error = await getError(() => app().parse("unknown-app", {} as any, {} as any));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.description).toMatchInlineSnapshot(`
        "Unknown application:

          unknown-app

        It doesn't look like you have any applications.

        Visit https://gadget.new to create one!"
      `);
    });
  });
});
