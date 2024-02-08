import type { Command, Usage } from "../services/command/command.js";
import { FileSync, FileSyncArgs } from "../services/filesync/filesync.js";
import { sprint } from "../services/output/sprint.js";

export const args = FileSyncArgs;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Push your local file changes to Gadget.

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
    Push your local file changes to Gadget.

    The changes will be calculated from the last time you ran
    "ggt sync", "ggt push", or "ggt pull" in the chosen directory.

    If Gadget has also made changes since the last sync,
    you will be prompted to discard them or abort the push.

    {bold USAGE}

      ggt push [DIRECTORY] [--app=<name>] [--env=<name>] [--force]

    {bold EXAMPLES}

      $ ggt push
      $ ggt push ~/gadget/example
      $ ggt push ~/gadget/example --app=example
      $ ggt push ~/gadget/example --app=example --env=development
      $ ggt push ~/gadget/example --app=example --env=development --force

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

      --force
        If Gadget has also made changes since the last sync, they
        will be discarded without confirmation.
  `;
};

export const command: Command<typeof args> = async (ctx) => {
  const filesync = await FileSync.init(ctx);
  await filesync.push();
};
