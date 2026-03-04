import { ArgError } from "../services/command/arg.js";
import { defineCommand } from "../services/command/command.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import colors from "../services/output/colors.js";
import { confirm } from "../services/output/confirm.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export default defineCommand({
  name: "push",
  description: "Upload local file changes to Gadget",
  details: sprint`
    Uploads all local file changes since the last sync to your Gadget environment. If the
    environment also has changes since the last sync, you'll be prompted to discard those
    environment changes or abort. Use --force to skip the prompt and discard automatically.
  `,
  sections: [
    {
      title: "See Also",
      content: "ggt pull — Download environment files.\nggt dev — Bidirectional file sync with real-time watching.",
    },
  ],
  examples: ["ggt push", "ggt push --env main", "ggt push --env main --force"],
  args: {
    ...SyncJsonArgs,
    "--env": {
      type: String,
      alias: ["-e", "--environment", "--to"],
      description: "Environment to push to",
      valueName: "environment",
      details: "Defaults to the development environment recorded in .gadget/sync.json. Production cannot be pushed to.",
    },
    "--force": {
      type: Boolean,
      alias: "-f",
      description: "Push without prompting, discarding environment changes",
      details: "Any changes on the environment since the last sync are overwritten by your local files.",
    },
  },
  run: async (ctx, args) => {
    if (args._.length > 0) {
      throw new ArgError(
        sprint`
          "ggt push" does not take any positional arguments.

          If you are trying to push changes from a specific directory,
          you must "cd" to that directory and then run "ggt push".
        `,
      );
    }

    const directory = await loadSyncJsonDirectory(process.cwd());
    const syncJson = await SyncJson.loadOrAskAndInit(ctx, { command: "push", args, directory });
    const filesync = new FileSync(syncJson);
    const hashes = await filesync.hashes(ctx);

    if (hashes.localChangesToPush.size === 0) {
      println({ ensureEmptyLineAbove: true, content: "Nothing to push." });
      return;
    }

    if (hashes.environmentChanges.size > 0 && !hashes.onlyDotGadgetFilesChanged) {
      // show them the environment changes they will discard
      await filesync.print(ctx, { hashes });

      if (!args["--force"]) {
        // they didn't pass --force, so we need to ask them if they want to discard the environment changes
        await confirm({
          ensureEmptyLineAbove: true,
          content: sprint`Are you sure you want to ${colors.emphasis("discard")} your environment's changes?`,
        });
      }
    }

    await filesync.push(ctx, { command: "push", hashes });
  },
});
