import { beforeEach, describe, expect, it } from "vitest";
import { command } from "../../src/commands/list.js";
import * as app from "../../src/services/app/app.js";
import { type Context } from "../../src/services/command/context.js";
import * as user from "../../src/services/user/user.js";
import { makeContext } from "../__support__/context.js";
import { mock } from "../__support__/mock.js";
import { expectStdout } from "../__support__/stream.js";

describe("list", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("lists apps", async () => {
    mock(user, "getUserOrLogin", () => ({ id: 1, email: "test@example.com", name: "Jane Doe" }));
    mock(app, "getApps", () => [
      { id: 1, slug: "app-a", primaryDomain: "app-a.example.com", hasSplitEnvironments: true },
      { id: 2, slug: "app-b", primaryDomain: "cool-app.com", hasSplitEnvironments: true },
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
    mock(user, "getUserOrLogin", () => ({ id: 1, email: "test@example.com", name: "Jane Doe" }));
    mock(app, "getApps", () => []);

    await command(ctx);

    expect(user.getUserOrLogin).toHaveBeenCalled();
    expectStdout().toMatchInlineSnapshot(`
      "It doesn't look like you have any applications.

      Visit https://gadget.new to create one!
      "
    `);
  });
});
