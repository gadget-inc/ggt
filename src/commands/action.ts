import { addAction } from "../services/add/action.ts";
import { defineCommand } from "../services/command/command.ts";
import type { Context } from "../services/command/context.ts";
import type { FlagsResult } from "../services/command/flag.ts";
import { UnknownDirectoryError } from "../services/filesync/error.ts";
import { FileSync } from "../services/filesync/filesync.ts";
import { SyncJson, SyncJsonFlags, loadSyncJsonDirectory } from "../services/filesync/sync-json.ts";
import colors from "../services/output/colors.ts";
import { println } from "../services/output/print.ts";
import { sprint } from "../services/output/sprint.ts";
import { symbol } from "../services/output/symbols.ts";
import { ts } from "../services/output/timestamp.ts";

type ActionFlagsResult = FlagsResult<typeof SyncJsonFlags>;

const setupActionSync = async (ctx: Context, flags: ActionFlagsResult): Promise<{ filesync: FileSync; syncJson: SyncJson }> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { command: "action", flags, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError({ command: "action", flags, directory });
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

  println({ ensureEmptyLineAbove: true, content: `${colors.created(symbol.tick)} Sync completed ${ts()}` });

  return { filesync, syncJson };
};

export default defineCommand({
  name: "action",
  description: "Add and manage actions",
  details: sprint`
    Actions run server-side code in your app. Add global actions for reusable
    logic, or add model actions that run in the context of a specific model.
  `,
  examples: [
    "ggt action add sendWelcomeEmail",
    "ggt action add notifications/sendWelcomeEmail",
    "ggt action add publish --model post",
    "ggt action add fulfill --model shopifyOrder",
  ],
  flags: SyncJsonFlags,
  subcommands: (sub) => ({
    add: sub({
      description: "Add an action to your app",
      details: sprint`
        Without ${colors.subdued("--model")}, adds a global action. With ${colors.subdued("--model")},
        adds an action to an existing model.
      `,
      examples: [
        "ggt action add sendWelcomeEmail",
        "ggt action add notifications/sendWelcomeEmail",
        "ggt action add publish --model post",
        "ggt action add fulfill --model shopifyOrder",
      ],
      positionals: [
        {
          name: "name",
          required: true,
          description: "Action API identifier",
          details: "Can include namespaces as folders (for example notifications/sendWelcomeEmail).",
        },
      ],
      flags: {
        "--model": {
          type: String,
          description: "Add a model action to the specified model",
          details: "Model API identifier. Can include namespaces (for example billing/invoice).",
        },
      },
      run: async (ctx, flags) => {
        const { filesync, syncJson } = await setupActionSync(ctx, flags);

        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const actionName = flags._[0]!;

        const modelApiIdentifier = flags["--model"];
        const path = modelApiIdentifier ? `model/${modelApiIdentifier}/${actionName}` : actionName;

        await addAction(ctx, {
          syncJson,
          filesync,
          path,
        });

        println({ ensureEmptyLineAbove: true, content: `Action ${colors.code(actionName)} added successfully.` });
      },
    }),
  }),
});
