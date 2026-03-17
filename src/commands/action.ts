import { addAction } from "../services/add/action.ts";
import { defineCommand } from "../services/command/command.ts";
import { setupCommandSync } from "../services/filesync/setup-sync.ts";
import { SyncJsonFlags } from "../services/filesync/sync-json.ts";
import colors from "../services/output/colors.ts";
import { println } from "../services/output/print.ts";
import { sprint } from "../services/output/sprint.ts";

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
        const { filesync, syncJson } = await setupCommandSync(ctx, "action", flags);

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
