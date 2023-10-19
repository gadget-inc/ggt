import { describe, expect, it, vi } from "vitest";
import { run } from "../../src/commands/list.js";
import * as app from "../../src/services/app.js";
import * as user from "../../src/services/user.js";
import { expectStdout, testUser } from "../util.js";

describe("list", () => {
  it("lists apps", async () => {
    vi.spyOn(user, "getUserOrLogin").mockResolvedValue({ id: 1, email: "test@example.com", name: "Jane Doe" });
    vi.spyOn(app, "getApps").mockResolvedValue([
      { id: 1, slug: "app-a", primaryDomain: "app-a.example.com", hasSplitEnvironments: true, user: testUser },
      { id: 2, slug: "app-b", primaryDomain: "cool-app.com", hasSplitEnvironments: true, user: testUser },
    ]);

    await run();

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

    await run();

    expect(user.getUserOrLogin).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "It doesn't look like you have any applications.

      Visit https://gadget.new to create one!
      "
    `);
  });
});
