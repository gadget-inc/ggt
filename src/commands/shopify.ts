import fs from "node:fs/promises";
import path from "node:path";

import chalk from "chalk";
import pluralize from "pluralize";
import type { JsonObject } from "type-fest";

import {
  CONNECT_SHOPIFY_MUTATION,
  IMPORT_SHOPIFY_CLI_SESSION_MUTATION,
  SHOPIFY_ORGANIZATIONS_QUERY,
  SHOPIFY_STATUS_QUERY,
  type ShopifyOrganization,
} from "../services/app/edit/operation.ts";
import { defineCommand } from "../services/command/command.ts";
import type { Context } from "../services/command/context.ts";
import { FlagError, type FlagsResult } from "../services/command/flag.ts";
import { config } from "../services/config/config.ts";
import { UnknownDirectoryError } from "../services/filesync/error.ts";
import { FileSync } from "../services/filesync/filesync.ts";
import { SyncJson, SyncJsonFlags, loadSyncJsonDirectory } from "../services/filesync/sync-json.ts";
import colors from "../services/output/colors.ts";
import { println } from "../services/output/print.ts";
import { sprint, sprintln } from "../services/output/sprint.ts";
import { symbol } from "../services/output/symbols.ts";
import { ts } from "../services/output/timestamp.ts";

const SHOPIFY_AUTH_LOGIN_ERROR_MESSAGE = "Shopify CLI session not found. Run `shopify auth login` and try again.";
const STATUS_LABEL_WIDTH = 24;

const ConnectFlags = {
  "--app-name": {
    type: String,
    description: "Shopify app name override",
    details: "Defaults to your Gadget app slug.",
  },
  "--shopify-organization-id": {
    type: String,
    description: "Shopify organization ID to use when your account has multiple organizations",
  },
};

type ConnectFlagsResult = FlagsResult<typeof SyncJsonFlags & typeof ConnectFlags>;
type StatusFlagsResult = FlagsResult<typeof SyncJsonFlags>;

export default defineCommand({
  name: "shopify",
  description: "Manage Shopify connection",
  examples: ["ggt shopify connect", "ggt shopify status", "ggt shopify connect --app-name my-shop"],
  flags: SyncJsonFlags,
  subcommands: (sub) => ({
    connect: sub({
      description: "Configure the Shopify connection for your application",
      details: sprint`
        Creates development and production Shopify app configs, adds the
        default Shopify models, and adds the required default Shopify scopes.
      `,
      examples: [
        "ggt shopify connect",
        "ggt shopify connect --app-name my-shop",
        "ggt shopify connect --shopify-organization-id 123456789",
      ],
      flags: ConnectFlags,
      run: async (ctx, flags) => {
        await runConnect(ctx, flags);
      },
    }),
    status: sub({
      description: "Show the status of your Shopify connection",
      details: sprint`
        Shows your current Shopify API version, enabled Shopify models,
        authenticated Shopify account, and app/client id details.
      `,
      examples: ["ggt shopify status"],
      run: async (ctx, flags) => {
        await runStatus(ctx, flags);
      },
    }),
  }),
});

// Mirrors Shopify CLI's conf/env-paths resolution for projectName "shopify-cli-kit":
// - Windows: %APPDATA%\shopify-cli-kit-nodejs\Config\config.json
// - macOS: ~/Library/Preferences/shopify-cli-kit-nodejs/config.json
// - Linux/other: $XDG_CONFIG_HOME/shopify-cli-kit-nodejs/config.json (or ~/.config/...)
// References:
// - https://github.com/Shopify/cli/blob/3.91.0/packages/cli-kit/src/private/node/conf-store.ts
// - https://github.com/sindresorhus/conf/blob/v13.1.0/source/index.ts
// - https://github.com/sindresorhus/env-paths/blob/v3.0.0/index.js
const getShopifyCliConfigPath = (): string => {
  if (config.windows) {
    const appData = process.env["APPDATA"] ?? path.join(config.homeDir, "AppData", "Roaming");
    return path.join(appData, "shopify-cli-kit-nodejs", "Config", "config.json");
  }

  const xdgConfigHome = process.env["XDG_CONFIG_HOME"];
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, "shopify-cli-kit-nodejs", "config.json");
  }

  if (config.macos) {
    return path.join(config.homeDir, "Library", "Preferences", "shopify-cli-kit-nodejs", "config.json");
  }

  return path.join(config.homeDir, ".config", "shopify-cli-kit-nodejs", "config.json");
};

const loadShopifyCliSessionPayload = async (): Promise<JsonObject> => {
  const configPath = getShopifyCliConfigPath();
  let configFileContent: string;

  try {
    configFileContent = await fs.readFile(configPath, "utf8");
  } catch {
    throw new FlagError(SHOPIFY_AUTH_LOGIN_ERROR_MESSAGE, { usageHint: false });
  }

  try {
    const configJson = JSON.parse(configFileContent) as { sessionStore?: unknown };
    if (typeof configJson.sessionStore !== "string") {
      throw new Error("Missing sessionStore");
    }

    const sessionPayload = JSON.parse(configJson.sessionStore);
    if (!sessionPayload || typeof sessionPayload !== "object") {
      throw new Error("Invalid session payload");
    }

    return sessionPayload as JsonObject;
  } catch {
    throw new FlagError(SHOPIFY_AUTH_LOGIN_ERROR_MESSAGE, { usageHint: false });
  }
};

const printShopifyOrganizations = (organizations: ShopifyOrganization[]): void => {
  println({ ensureEmptyLineAbove: true, content: "Shopify organizations available:" });
  for (const organization of organizations) {
    println({ content: `  - ${organization.id}: ${organization.name} (${organization.platform})` });
  }
};

const resolveShopifyOrganizationId = async (syncJson: SyncJson, providedOrganizationId?: string): Promise<string> => {
  if (providedOrganizationId) {
    return providedOrganizationId;
  }

  const organizations = (await syncJson.edit.query({ query: SHOPIFY_ORGANIZATIONS_QUERY })).shopifyOrganizations;

  if (organizations.length === 0) {
    throw new FlagError("No Shopify organizations were found for your account. Run `shopify auth login` and try again.", {
      usageHint: false,
    });
  }

  if (organizations.length === 1) {
    const organization = organizations[0];
    return organization.id;
  }

  printShopifyOrganizations(organizations);
  throw new FlagError("Multiple Shopify organizations found. Re-run with --shopify-organization-id <id>.", {
    usageHint: false,
  });
};

const statusLine = (label: string, value: string): string => `${label.padEnd(STATUS_LABEL_WIDTH)}${value}`;

const runStatus = async (ctx: Context, flags: StatusFlagsResult): Promise<void> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { command: "shopify", flags, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError({ command: "shopify", flags, directory });
  }

  const { shopifyIdentityConnectionState: identity, shopifyConnection: conn } = await syncJson.edit.query({
    query: SHOPIFY_STATUS_QUERY,
  });

  const apiVersion = conn
    ? conn.apiVersionUpToDate
      ? conn.apiVersion
      : `${conn.apiVersion} (${conn.latestApiVersion} available)`
    : "Not configured";

  const models = conn && conn.enabledModels.length > 0 ? conn.enabledModels.join(" | ") : "None";

  const account = identity.isConnected ? (identity.email ?? "Connected (email unavailable)") : "Not connected";

  const app = conn?.canonicalApp
    ? conn.canonicalApp.appName
      ? `${conn.canonicalApp.appName} (client_id: ${conn.canonicalApp.clientId})`
      : `client_id: ${conn.canonicalApp.clientId}`
    : "Not configured";

  const scopes = conn ? (conn.scopes.length > 0 ? conn.scopes.join(" | ") : "None") : "Not configured";

  const webhookTopics = conn ? (conn.webhookTopics.length > 0 ? conn.webhookTopics.join(" | ") : "None") : "Not configured";

  println({ ensureEmptyLineAbove: true, content: statusLine("API version:", apiVersion) });
  println({ content: statusLine("Enabled models:", models) });
  println({ content: statusLine("Authed partner account:", account) });
  println({ content: statusLine("App:", app) });
  println({ content: statusLine("Scopes:", scopes) });
  println({ content: statusLine("Webhook topics:", webhookTopics) });
};

const runConnect = async (ctx: Context, flags: ConnectFlagsResult): Promise<void> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { command: "shopify", flags, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError({ command: "shopify", flags, directory });
  }

  const shopifyCliSessionPayload = await loadShopifyCliSessionPayload();
  const importResult = await syncJson.edit.mutate({
    mutation: IMPORT_SHOPIFY_CLI_SESSION_MUTATION,
    variables: { configSessionPayload: shopifyCliSessionPayload },
  });

  if (!importResult.importShopifyCliSession.success) {
    throw new FlagError("Failed to import Shopify CLI session. Run `shopify auth login` and try again.", {
      usageHint: false,
    });
  }

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx, { silent: true });

  if (!hashes.inSync) {
    await filesync.merge(ctx, {
      hashes,
      printEnvironmentChangesOptions: { limit: 5 },
      printLocalChangesOptions: { limit: 5 },
      silent: true,
    });
    println({ ensureEmptyLineAbove: true, content: `${chalk.greenBright(symbol.tick)} Sync completed ${ts()}` });
  }

  const appName = flags["--app-name"] ?? syncJson.application.slug;
  const shopifyOrganizationId = await resolveShopifyOrganizationId(syncJson, flags["--shopify-organization-id"]);

  const result = (
    await syncJson.edit.mutate({
      mutation: CONNECT_SHOPIFY_MUTATION,
      variables: { appName, shopifyOrganizationId },
    })
  ).connectShopify;

  const totalChanges = result.changed.length + result.deleted.length;

  await filesync.writeToLocalFilesystem(ctx, {
    filesVersion: result.remoteFilesVersion,
    files: result.changed,
    delete: result.deleted.map((file) => file.path),
    printEnvironmentChangesOptions: {
      tense: "past",
      ensureEmptyLineAbove: true,
      title: sprintln`${colors.created(symbol.tick)} Created Shopify connection ${pluralize("file", totalChanges)}. ${ts()}`,
      limit: 5,
    },
  });

  println({
    ensureEmptyLineAbove: true,
    content: `${chalk.greenBright(symbol.tick)} Shopify connection configured successfully.`,
  });
};
