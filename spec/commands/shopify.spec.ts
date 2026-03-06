import { beforeEach, describe, it } from "vitest";

import shopify from "../../src/commands/shopify.js";
import { CONNECT_SHOPIFY_MUTATION } from "../../src/services/app/edit/operation.js";
import { runCommand } from "../../src/services/command/run.js";
import { nockTestApps } from "../__support__/app.js";
import { testCtx } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { nockEditResponse } from "../__support__/graphql.js";
import { expectStdout } from "../__support__/output.js";
import { loginTestUser } from "../__support__/user.js";

describe("shopify", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  it("connects using the synced app slug as the default app name", async () => {
    nockEditResponse({
      operation: CONNECT_SHOPIFY_MUTATION,
      response: {
        data: {
          connectShopify: {
            remoteFilesVersion: "2",
            changed: [],
            deleted: [],
          },
        },
      },
      expectVariables: { appName: "test" },
    });

    await runCommand(testCtx, shopify, "connect");

    expectStdout().toContain("Shopify connection configured successfully");
  });

  it("connects using an overridden app name", async () => {
    nockEditResponse({
      operation: CONNECT_SHOPIFY_MUTATION,
      response: {
        data: {
          connectShopify: {
            remoteFilesVersion: "2",
            changed: [],
            deleted: [],
          },
        },
      },
      expectVariables: { appName: "custom-shopify-app" },
    });

    await runCommand(testCtx, shopify, "connect", "--app-name", "custom-shopify-app");

    expectStdout().toContain("Shopify connection configured successfully");
  });
});
