import chalk from "chalk";

import { CONNECT_SHOPIFY_MUTATION } from "../services/app/edit/operation.js";
import type { ArgsDefinitionResult } from "../services/command/arg.js";
import { defineCommand } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";
import { ts } from "../services/output/timestamp.js";

export default defineCommand({
  name: "shopify",
  description: "Manage Shopify connection setup",
  examples: ["ggt shopify connect", "ggt shopify connect --app-name my-shop"],
  args: SyncJsonArgs,
  subcommands: (sub) => ({
    connect: sub({
      description: "Create and configure a Shopify connection for this app",
      details: sprint`
        Creates development and production Shopify app configs using the app name,
        adds the default Shopify models, and adds the required default Shopify scopes.
      `,
      examples: ["ggt shopify connect", "ggt shopify connect --app-name my-shop"],
      args: {
        "--app-name": {
          type: String,
          description: "Shopify app name override",
          details: "Defaults to your Gadget app slug.",
        },
      },
      run: async (ctx, args) => {
        await runConnect(ctx, args);
      },
    }),
  }),
});

type ConnectArgs = typeof SyncJsonArgs & {
  "--app-name": { type: StringConstructor };
};

const runConnect = async (ctx: Context, args: ArgsDefinitionResult<ConnectArgs>): Promise<void> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { command: "shopify", args, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError({ command: "shopify", args, directory });
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
  }

  println({ ensureEmptyLineAbove: true, content: `${chalk.greenBright(symbol.tick)} Sync completed ${ts()}` });

  const appName = args["--app-name"] ?? syncJson.application.slug;

  const result = (
    await syncJson.edit.mutate({
      mutation: CONNECT_SHOPIFY_MUTATION,
      variables: { appName },
    })
  ).connectShopify;

  await filesync.writeToLocalFilesystem(ctx, {
    filesVersion: result.remoteFilesVersion,
    files: result.changed,
    delete: result.deleted.map((file) => file.path),
  });

  println({
    ensureEmptyLineAbove: true,
    content: `${chalk.greenBright(symbol.tick)} Shopify connection configured successfully.`,
  });
};
