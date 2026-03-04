import { ArgError } from "../services/command/arg.js";
import { defineCommand } from "../services/command/command.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export default defineCommand({
  name: "pull",
  description: "Download environment files to your local directory",
  details: sprint`
    Downloads all environment file changes since the last sync to your local directory. If
    you also have local changes since the last sync, you'll be prompted to discard those
    local changes or abort. Use --force to skip the prompt and discard automatically.
  `,
  sections: [
    {
      title: "See Also",
      content: "ggt push — Upload local file changes to Gadget.\nggt dev — Bidirectional file sync with real-time watching.",
    },
  ],
  examples: ["ggt pull", "ggt pull --env staging", "ggt pull --env production --force"],
  args: {
    ...SyncJsonArgs,
    "--env": {
      type: String,
      alias: ["-e", "--environment", "--from"],
      description: "Environment to pull from",
      valueName: "environment",
      details: "Defaults to the development environment recorded in .gadget/sync.json.",
    },
    "--force": {
      type: Boolean,
      alias: "-f",
      description: "Pull without prompting, discarding local changes",
      details: "Any local changes since the last sync are overwritten by the environment's files.",
    },
  },
  run: async (ctx, args) => {
    if (args._.length > 0) {
      throw new ArgError(
        sprint`
          "ggt pull" does not take any positional arguments.

          If you are trying to pull changes to a specific directory,
          you must "cd" to that directory and then run "ggt pull".
        `,
      );
    }

    const directory = await loadSyncJsonDirectory(process.cwd());
    const syncJson = await SyncJson.loadOrAskAndInit(ctx, { command: "pull", args, directory });
    const filesync = new FileSync(syncJson);
    const hashes = await filesync.hashes(ctx);

    if (hashes.environmentChangesToPull.size === 0) {
      println({ ensureEmptyLineAbove: true, content: "Nothing to pull." });
      return;
    }

    if (hashes.localChangesToPush.size > 0) {
      // show them the local changes they will discard
      await filesync.print(ctx, { hashes });
    }

    await filesync.pull(ctx, { hashes, force: args["--force"] });
  },
});
