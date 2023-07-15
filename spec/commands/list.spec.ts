import { describe, expect, it, vi } from "vitest";
import List from "../../src/commands/list.js";
import { context } from "../../src/services/context.js";

describe("list", () => {
  it("requires a user to be logged in", () => {
    const list = new List([], context.config);
    expect(list.requireUser).toBe(true);
  });

  it("lists apps", async () => {
    vi.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    vi.spyOn(context, "getAvailableApps").mockResolvedValue([
      { id: 1, slug: "app-a", primaryDomain: "app-a.example.com", hasSplitEnvironments: true },
      { id: 2, slug: "app-b", primaryDomain: "cool-app.com", hasSplitEnvironments: true },
    ]);

    await List.run([]);

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
    vi.spyOn(context, "getUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    vi.spyOn(context, "getAvailableApps").mockResolvedValue([]);

    await List.run([]);

    expect(context.getUser).toHaveBeenCalled();
    expect(List.prototype.log.mock.lastCall?.[0]).toMatchInlineSnapshot(`
      "It doesn't look like you have any applications.

      Visit https://gadget.new to create one!"
    `);
  });
});
