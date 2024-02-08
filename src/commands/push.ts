import type { Command, Usage } from "../services/command/command.js";
import { FileSync, FileSyncArgs } from "../services/filesync/filesync.js";
import { SyncJson } from "../services/filesync/sync-json.js";
import { sprint } from "../services/output/sprint.js";

export const args = FileSyncArgs;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Push changes from your local filesystem to Gadget's filesystem.

      {bold USAGE}
        ggt push [DIRECTORY]

      {bold EXAMPLES}
        $ ggt push
        $ ggt push ~/gadget/example
        $ ggt push ~/gadget/example --app=example
        $ ggt push ~/gadget/example --app=example --env=development

      {bold ARGUMENTS}
        DIRECTORY          The directory to push files from (default: ".")

      {bold FLAGS}
        -a, --app=<name>   The Gadget application to push files to
        -e, --env=<name>   The Gadget environment to push files to
            --force        Discard Gadget's changes

        Run "ggt push --help" for more information.
    `;
  }

  return sprint`
    Push changes from your local filesystem to Gadget's filesystem.

    The changes will be calculated from the last time you ran
    "ggt sync", "ggt push", or "ggt pull" in the chosen directory.

    If Gadget has also made changes since the last sync,
    you will be prompted to discard them or abort the push.

    {bold USAGE}

      ggt push [DIRECTORY] [--app=<name>] [--env=<name>] [--force]
                           [--allow-unknown-directory] [--allow-different-app]

    {bold EXAMPLES}

      $ ggt push
      $ ggt push ~/gadget/example
      $ ggt push ~/gadget/example --app=example
      $ ggt push ~/gadget/example --app=example --env=development
      $ ggt push ~/gadget/example --app=example --env=development --allow-unknown-directory
      $ ggt push ~/gadget/example --app=example --env=development --allow-unknown-directory --allow-different-app

    {bold ARGUMENTS}

      DIRECTORY
        The path to the directory to push files from.

        Defaults to the current working directory. (default: ".")

    {bold FLAGS}

      -a, --app=<name>
        The Gadget application to push files to.

        If not provided, the application will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found, you will be
        prompted to choose an application from your list of apps.

      -e, --env, --environment=<name>
        The Gadget development environment to push files to.

        If not provided, the environment will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found or invalid, you will
        be prompted to choose a development environment from your list
        of environments.

      --force
        Any changes Gadget has made changes since the last time you ran
        "ggt sync", "ggt push", or "ggt pull" will be discarded
        without confirmation.

      --allow-unknown-directory
        Allows push to continue when the chosen directory already
        contains files and does not contain a valid ".gadget/sync.json"
        file within it, or any of its parent directories.

        Defaults to false.

      --allow-different-app
        Allows push to continue when the chosen directory contains a
        valid ".gadget/sync.json" file, but the application within
        it does not match the application provided by the --app flag.

        Defaults to false.
  `;
};

export const command: Command<typeof args> = async (ctx) => {
  // TODO: this should use load instead of loadOrInit
  const syncJson = await SyncJson.loadOrInit(ctx, { directory: ctx.args._[0] });
  const filesync = new FileSync(ctx, syncJson);
  await filesync.push();
};
