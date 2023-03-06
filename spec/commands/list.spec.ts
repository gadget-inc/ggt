import List from "../../src/commands/list";
import { context } from "../../src/utils/context";

describe("list", () => {
  it("asks the user to log in if they aren't logged in", async () => {
    jest.spyOn(context, "getUser").mockResolvedValue(undefined);

    await List.run();

    expect(context.getUser).toHaveBeenCalled();
    expect(List.prototype.log.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "No apps found",
        ],
      ]
    `);
  });

  it("lists the apps if the user is logged in", async () => {
    jest.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    jest.spyOn(context, "getAvailableApps").mockResolvedValue([
      { id: 1, slug: "app-a", primaryDomain: "app-a.example.com", hasSplitEnvironments: true },
      { id: 2, slug: "app-b", primaryDomain: "cool-app.com", hasSplitEnvironments: true },
    ]);

    await List.run();

    expect(context.getUser).toHaveBeenCalled();
    expect(List.prototype.log.mock.calls).toMatchInlineSnapshot(`
      [
        [
          " Slug  Domain            ",
        ],
        [
          " ───── ───────────────── ",
        ],
        [
          " app-a app-a.example.com ",
        ],
        [
          " app-b cool-app.com      ",
        ],
      ]
    `);
  });

  it("lists no apps if the user doesn't have any", async () => {
    jest.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    jest.spyOn(context, "getAvailableApps").mockResolvedValue([]);

    await List.run();

    expect(context.getUser).toHaveBeenCalled();
    expect(List.prototype.log.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "No apps found",
        ],
      ]
    `);
  });
});
