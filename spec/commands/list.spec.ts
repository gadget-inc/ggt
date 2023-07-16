import { describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/list.js";
import { context } from "../../src/services/context.js";
import { expectStdout } from "../util.js";

describe("list", () => {
  it("lists apps", async () => {
    vi.spyOn(context, "requireUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    vi.spyOn(context, "getAvailableApps").mockResolvedValue([
      { id: 1, slug: "app-a", primaryDomain: "app-a.example.com", hasSplitEnvironments: true },
      { id: 2, slug: "app-b", primaryDomain: "cool-app.com", hasSplitEnvironments: true },
    ]);

    await run();

    expect(context.requireUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "Slug  Domain
      ───── ─────────────────
      app-a app-a.example.com
      app-b cool-app.com
      "
    `);
  });

  it("lists no apps if the user doesn't have any", async () => {
    vi.spyOn(context, "requireUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    vi.spyOn(context, "getAvailableApps").mockResolvedValue([]);

    await run();

    expect(context.requireUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "It doesn't look like you have any applications.

      Visit https://gadget.new to create one!
      "
    `);
  });
});
