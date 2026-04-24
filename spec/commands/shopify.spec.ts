import path from "node:path";

import fs from "fs-extra";
import type { JsonObject } from "type-fest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import shopify from "../../src/commands/shopify.ts";
import {
  CONNECT_SHOPIFY_MUTATION,
  IMPORT_SHOPIFY_CLI_SESSION_MUTATION,
  SHOPIFY_ORGANIZATIONS_QUERY,
  SHOPIFY_STATUS_QUERY,
} from "../../src/services/app/edit/operation.ts";
import { runCommand } from "../../src/services/command/run.ts";
import { config } from "../../src/services/config/config.ts";
import { nockTestApps } from "../__support__/app.ts";
import { testCtx } from "../__support__/context.ts";
import { expectError } from "../__support__/error.ts";
import { makeSyncScenario } from "../__support__/filesync.ts";
import { nockEditResponse } from "../__support__/graphql.ts";
import { expectStdout } from "../__support__/output.ts";
import { testDirPath } from "../__support__/paths.ts";
import { loginTestUser } from "../__support__/user.ts";

const sampleShopifyCliSessionPayload = (): JsonObject => ({
  "accounts.shopify.com": {
    "imported-user-id": {
      identity: {
        accessToken: "imported-access-token",
        refreshToken: "imported-refresh-token",
        expiresAt: "2030-01-01T00:00:00.000Z",
        scopes: ["openid", "email"],
        userId: "imported-user-id",
        alias: "test@example.com",
      },
      applications: {
        partners: {
          accessToken: "imported-partners-token",
          expiresAt: "2030-01-01T00:00:00.000Z",
          scopes: ["https://api.shopify.com/auth/partners.app.cli.access"],
        },
      },
    },
  },
});

const writeShopifyCliConfig = async (sessionPayload: JsonObject) => {
  let configPath = path.join(testDirPath("xdg-config"), "shopify-cli-kit-nodejs", "config.json");

  if (config.windows) {
    configPath = path.join(testDirPath("windows-appdata"), "shopify-cli-kit-nodejs", "Config", "config.json");
  } else if (!process.env["XDG_CONFIG_HOME"] && config.macos) {
    configPath = path.join(testDirPath("home-macos"), "Library", "Preferences", "shopify-cli-kit-nodejs", "config.json");
  }

  await fs.outputFile(configPath, JSON.stringify({ sessionStore: JSON.stringify(sessionPayload) }));
};

const mockImportSuccess = (sessionPayload: JsonObject) =>
  nockEditResponse({
    operation: IMPORT_SHOPIFY_CLI_SESSION_MUTATION,
    response: { data: { importShopifyCliSession: { success: true } } },
    expectVariables: { configSessionPayload: sessionPayload },
  });

const mockSingleOrg = () =>
  nockEditResponse({
    operation: SHOPIFY_ORGANIZATIONS_QUERY,
    response: {
      data: {
        shopifyOrganizations: [{ id: "org-1", name: "Org One", platform: "DEV" }],
      },
    },
  });

const mockConnectSuccess = (appName: string, shopifyOrganizationId: string) =>
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
    expectVariables: { appName, shopifyOrganizationId },
  });

const mockStatusResponse = (response: (typeof SHOPIFY_STATUS_QUERY)["Data"]) =>
  nockEditResponse({
    operation: SHOPIFY_STATUS_QUERY,
    response: {
      data: response,
    },
  });

describe("shopify", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
    vi.stubEnv("XDG_CONFIG_HOME", testDirPath("xdg-config"));
    vi.stubEnv("APPDATA", testDirPath("windows-appdata"));
  });

  it("imports Shopify CLI session first and connects using the synced app slug by default", async () => {
    const sessionPayload = sampleShopifyCliSessionPayload();
    await writeShopifyCliConfig(sessionPayload);

    mockImportSuccess(sessionPayload);
    mockSingleOrg();
    mockConnectSuccess("test", "org-1");

    await runCommand(testCtx, shopify, "connect");

    expectStdout().toContain("Shopify connection configured successfully");
  });

  it("connects using an overridden app name and organization id", async () => {
    const sessionPayload = sampleShopifyCliSessionPayload();
    await writeShopifyCliConfig(sessionPayload);

    mockImportSuccess(sessionPayload);
    mockConnectSuccess("custom-shopify-app", "org-2");

    await runCommand(testCtx, shopify, "connect", "--app-name", "custom-shopify-app", "--shopify-organization-id", "org-2");

    expectStdout().toContain("Shopify connection configured successfully");
  });

  it("prints Shopify status details", async () => {
    mockStatusResponse({
      shopifyIdentityConnectionState: { isConnected: true, email: "shardul@gadget.dev" },
      shopifyConnection: {
        apiVersion: "2024-04",
        latestApiVersion: "2026-04",
        apiVersionUpToDate: false,
        enabledModels: ["shopifyProduct", "shopifyVariant"],
        canonicalApp: { appName: "my-gadget-app", clientId: "abc123" },
        scopes: ["read_orders", "write_products"],
        webhookTopics: ["app/uninstalled", "orders/create", "orders/updated"],
      },
    });

    await runCommand(testCtx, shopify, "status");

    expectStdout().toContain("2024-04 (2026-04 available)");
    expectStdout().toContain("shopifyProduct | shopifyVariant");
    expectStdout().toContain("shardul@gadget.dev");
    expectStdout().toContain("my-gadget-app (client_id: abc123)");
    expectStdout().toContain("read_orders | write_products");
    expectStdout().toContain("app/uninstalled | orders/create | orders/updated");
  });

  it("errors with auth login guidance when Shopify CLI config is missing", async () => {
    const error = await expectError(() => runCommand(testCtx, shopify, "connect"));
    expect(error.message).toContain("shopify auth login");
  });

  it("errors when importing Shopify CLI session fails", async () => {
    const sessionPayload = sampleShopifyCliSessionPayload();
    await writeShopifyCliConfig(sessionPayload);

    nockEditResponse({
      operation: IMPORT_SHOPIFY_CLI_SESSION_MUTATION,
      response: { data: { importShopifyCliSession: { success: false } } },
      expectVariables: { configSessionPayload: sessionPayload },
    });

    const error = await expectError(() => runCommand(testCtx, shopify, "connect"));
    expect(error.message).toContain("Failed to import Shopify CLI session");
  });

  it("errors when no Shopify organizations are found", async () => {
    const sessionPayload = sampleShopifyCliSessionPayload();
    await writeShopifyCliConfig(sessionPayload);

    mockImportSuccess(sessionPayload);

    nockEditResponse({
      operation: SHOPIFY_ORGANIZATIONS_QUERY,
      response: {
        data: {
          shopifyOrganizations: [],
        },
      },
    });

    const error = await expectError(() => runCommand(testCtx, shopify, "connect"));
    expect(error.message).toContain("No Shopify organizations were found");
  });

  it("prints available organizations and errors when multiple organizations are found without an id", async () => {
    const sessionPayload = sampleShopifyCliSessionPayload();
    await writeShopifyCliConfig(sessionPayload);

    mockImportSuccess(sessionPayload);

    nockEditResponse({
      operation: SHOPIFY_ORGANIZATIONS_QUERY,
      response: {
        data: {
          shopifyOrganizations: [
            { id: "org-1", name: "Org One", platform: "DEV" },
            { id: "org-2", name: "Org Two", platform: "DEV" },
          ],
        },
      },
    });

    const error = await expectError(() => runCommand(testCtx, shopify, "connect"));

    expect(error.message).toContain("--shopify-organization-id");
    expectStdout().toContain("Shopify organizations available:");
    expectStdout().toContain("org-1");
    expectStdout().toContain("org-2");
  });
});
