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
  TRIGGER_RUN_SHOPIFY_SYNC_MUTATION,
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

const mockShopifySyncResponse = (
  expectVariables: (typeof TRIGGER_RUN_SHOPIFY_SYNC_MUTATION)["Variables"],
  result: NonNullable<(typeof TRIGGER_RUN_SHOPIFY_SYNC_MUTATION)["Data"]["triggerRunShopifySync"]>,
) =>
  nockEditResponse({
    operation: TRIGGER_RUN_SHOPIFY_SYNC_MUTATION,
    expectVariables,
    response: {
      data: {
        triggerRunShopifySync: result,
      },
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

  it("starts Shopify sync for all installed shops when no selector is passed", async () => {
    mockShopifySyncResponse(
      { syncLast: 10 },
      {
        success: true,
        successfulShopIds: ["1", "2"],
        failedShops: [],
      },
    );

    await runCommand(testCtx, shopify, "sync");

    expectStdout().toContain("Started Shopify sync for 2 shops.");
    expectStdout().toContain("last:   10 records");
    expectStdout().toContain("View sync records:");
    expectStdout().toContain("/edit/development/model/DataModel-Shopify-Sync/data?");
  });

  it("starts Shopify sync for a store selector", async () => {
    mockShopifySyncResponse(
      { store: "mystore.myshopify.com", syncLast: 10 },
      {
        success: true,
        successfulShopIds: ["1"],
        failedShops: [],
      },
    );

    await runCommand(testCtx, shopify, "sync", "--store", "mystore.myshopify.com");

    expectStdout().toContain("Started Shopify sync for mystore.myshopify.com.");
    expectStdout().toContain("last:   10 records");
    expectStdout().toContain("View sync records:");
    expectStdout().toContain("/edit/development/model/DataModel-Shopify-Sync/data?");
  });

  it("starts Shopify sync for comma-separated shop IDs", async () => {
    mockShopifySyncResponse(
      { shopIds: ["1", "2"], syncLast: 10 },
      {
        success: true,
        successfulShopIds: ["1", "2"],
        failedShops: [],
      },
    );

    await runCommand(testCtx, shopify, "sync", "--shop-ids", "1, 2");

    expectStdout().toContain("Started Shopify sync for 2 shops.");
    expectStdout().toContain("last:   10 records");
    expectStdout().toContain("View sync records:");
    expectStdout().toContain("/edit/development/model/DataModel-Shopify-Sync/data?");
  });

  it("trims and ignores empty values in shop ID lists", async () => {
    mockShopifySyncResponse(
      { shopIds: ["1", "2", "3"], syncLast: 10 },
      {
        success: true,
        successfulShopIds: ["1", "2", "3"],
        failedShops: [],
      },
    );

    await runCommand(testCtx, shopify, "sync", "--shop-ids", " 1, , 2 ,, 3 ");

    expectStdout().toContain("Started Shopify sync for 3 shops.");
    expectStdout().toContain("last:   10 records");
    expectStdout().toContain("View sync records:");
    expectStdout().toContain("/edit/development/model/DataModel-Shopify-Sync/data?");
  });

  it("errors when shop ID lists have no values", async () => {
    const error = await expectError(() => runCommand(testCtx, shopify, "sync", "--shop-ids", " , , "));
    expect(error.message).toContain("--shop-ids must include at least one value");
  });

  it("passes models and since filters to Shopify sync", async () => {
    mockShopifySyncResponse(
      {
        models: ["shopifyProduct", "shopifyOrder"],
        syncSince: "2024-01-01T00:00:00.000Z",
        syncLast: 10,
      },
      {
        success: true,
        successfulShopIds: ["1"],
        failedShops: [],
      },
    );

    await runCommand(testCtx, shopify, "sync", "--models", "shopifyProduct,shopifyOrder", "--since", "2024-01-01");

    expectStdout().toContain("Started Shopify sync for 1 shop.");
    expectStdout().toContain("models: shopifyProduct, shopifyOrder");
    expectStdout().toContain("since:  2024-01-01T00:00:00.000Z");
    expectStdout().toContain("last:   10 records");
    expectStdout().toContain("View sync records:");
    expectStdout().toContain("/edit/development/model/DataModel-Shopify-Sync/data?");
  });

  it("trims and ignores empty values in model lists", async () => {
    mockShopifySyncResponse(
      { models: ["shopifyProduct", "shopifyOrder", "shopifyCustomer"], syncLast: 10 },
      {
        success: true,
        successfulShopIds: ["1"],
        failedShops: [],
      },
    );

    await runCommand(testCtx, shopify, "sync", "--models", " shopifyProduct, , shopifyOrder ,, shopifyCustomer ");

    expectStdout().toContain("Started Shopify sync for 1 shop.");
    expectStdout().toContain("models: shopifyProduct, shopifyOrder, shopifyCustomer");
    expectStdout().toContain("last:   10 records");
    expectStdout().toContain("View sync records:");
    expectStdout().toContain("/edit/development/model/DataModel-Shopify-Sync/data?");
  });

  it("errors when model lists have no values", async () => {
    const error = await expectError(() => runCommand(testCtx, shopify, "sync", "--models", " , , "));
    expect(error.message).toContain("--models must include at least one value");
  });

  it("passes an explicit last record limit to Shopify sync", async () => {
    mockShopifySyncResponse(
      { syncLast: 25 },
      {
        success: true,
        successfulShopIds: ["1"],
        failedShops: [],
      },
    );

    await runCommand(testCtx, shopify, "sync", "--last", "25");

    expectStdout().toContain("Started Shopify sync for 1 shop.");
    expectStdout().toContain("last:   25 records");
  });

  it("omits the last record limit when syncing all records", async () => {
    mockShopifySyncResponse(
      {},
      {
        success: true,
        successfulShopIds: ["1"],
        failedShops: [],
      },
    );

    await runCommand(testCtx, shopify, "sync", "--all");

    expectStdout().toContain("Started Shopify sync for 1 shop.");
    expectStdout().toContain("records: all");
  });

  it("errors when last record limit is invalid", async () => {
    const error = await expectError(() => runCommand(testCtx, shopify, "sync", "--last", "0"));
    expect(error.message).toContain("Invalid --last value");
  });

  it("errors when all and last are both provided", async () => {
    const error = await expectError(() => runCommand(testCtx, shopify, "sync", "--all", "--last", "25"));
    expect(error.message).toContain("--all and --last can't both be provided");
  });

  it("prints partial Shopify sync failures", async () => {
    mockShopifySyncResponse(
      { shopIds: ["1", "2", "3"], syncLast: 10 },
      {
        success: false,
        successfulShopIds: ["1", "2"],
        failedShops: [{ shopId: "3", failureReason: "Shop not found" }],
      },
    );

    await runCommand(testCtx, shopify, "sync", "--shop-ids", "1,2,3");

    expectStdout().toContain("Started Shopify sync for 2 shops. Failed for 1 shop.");
    expectStdout().toContain("last:   10 records");
    expectStdout().toContain("View sync records:");
    expectStdout().toContain("/edit/development/model/DataModel-Shopify-Sync/data?");
    expectStdout().toContain("Failed shops:");
    expectStdout().toContain("  3: Shop not found");
  });

  it("errors when no Shopify shops matched", async () => {
    mockShopifySyncResponse(
      { store: "missing.myshopify.com", syncLast: 10 },
      {
        success: false,
        successfulShopIds: [],
        failedShops: [],
      },
    );

    const error = await expectError(() => runCommand(testCtx, shopify, "sync", "--store", "missing.myshopify.com"));
    expect(error.message).toContain("No installed Shopify shops matched");
  });

  it("errors when store and shop IDs are both provided", async () => {
    const error = await expectError(() => runCommand(testCtx, shopify, "sync", "--store", "one.myshopify.com", "--shop-ids", "1"));
    expect(error.message).toContain("--store and --shop-ids can't both be provided");
  });

  it("errors when since is invalid", async () => {
    const error = await expectError(() => runCommand(testCtx, shopify, "sync", "--since", "not-a-date"));
    expect(error.message).toContain("Invalid --since value");
  });
});
