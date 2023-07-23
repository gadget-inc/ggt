import { beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/list.js";
import { Context } from "../../src/services/context.js";
import { expectStdout } from "../util.js";

describe("list", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = new Context();
  });

  it("lists apps", async () => {
    vi.spyOn(ctx, "requireUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    vi.spyOn(ctx, "getAvailableApps").mockResolvedValue([
      { id: 1, slug: "app-a", primaryDomain: "app-a.example.com", hasSplitEnvironments: true },
      { id: 2, slug: "app-b", primaryDomain: "cool-app.com", hasSplitEnvironments: true },
    ]);

    await run(ctx);

    expect(ctx.requireUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "Slug  Domain
      ───── ─────────────────
      app-a app-a.example.com
      app-b cool-app.com
      "
    `);
  });

  it("lists no apps if the user doesn't have any", async () => {
    vi.spyOn(ctx, "requireUser").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    vi.spyOn(ctx, "getAvailableApps").mockResolvedValue([]);

    await run(ctx);

    expect(ctx.requireUser).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "It doesn't look like you have any applications.

      Visit https://gadget.new to create one!
      "
    `);
  });
});
