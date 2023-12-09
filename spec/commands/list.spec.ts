import { beforeEach, describe, expect, it, vi } from "vitest";
import { command } from "../../src/commands/list.js";
import * as app from "../../src/services/app/app.js";
import { Context } from "../../src/services/command/context.js";
import * as user from "../../src/services/user/user.js";
import { expectStdout } from "../__support__/stream.js";
import { testUser } from "../__support__/user.js";

describe("list", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = new Context();
  });

  it("lists apps", async () => {
    vi.spyOn(user, "getUserOrLogin").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    vi.spyOn(app, "getApps").mockResolvedValue([
      { id: 1, slug: "app-a", primaryDomain: "app-a.example.com", hasSplitEnvironments: true, user: testUser },
      { id: 2, slug: "app-b", primaryDomain: "cool-app.com", hasSplitEnvironments: true, user: testUser },
    ]);

    await command(ctx);

    expect(user.getUserOrLogin).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "Slug  Domain
      ───── ─────────────────
      app-a app-a.example.com
      app-b cool-app.com
      "
    `);
  });

  it("lists no apps if the user doesn't have any", async () => {
    vi.spyOn(user, "getUserOrLogin").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    vi.spyOn(app, "getApps").mockResolvedValue([]);

    await command(ctx);

    expect(user.getUserOrLogin).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "It doesn't look like you have any applications.

      Visit https://gadget.new to create one!
      "
    `);
  });
});
