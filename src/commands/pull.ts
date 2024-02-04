import type { ArgsDefinition } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { FileSync, FileSyncArgs } from "../services/filesync/filesync.js";
import { sprint } from "../services/output/sprint.js";

export type PullArgs = typeof args;

export const args = {
  ...FileSyncArgs,
} satisfies ArgsDefinition;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Pull Gadget's file changes to your local filesystem.

      {bold USAGE}
        ggt pull [DIRECTORY]

      {bold EXAMPLES}
        $ ggt pull
        $ ggt pull ~/gadget/example
        $ ggt pull ~/gadget/example --app=example
        $ ggt pull ~/gadget/example --app=example --environment=development

      {bold ARGUMENTS}
        DIRECTORY                  The directory to pull files to (default: ".")

      {bold FLAGS}
        -a, --app=<name>           The Gadget application to pull files from
        -e, --environment=<name>   The Gadget environment to pull files from
            --force                Discard Gadget's changes

        Run "ggt pull --help" for more information.
    `;
  }

  return sprint`
    Pull Gadget's file changes to your local filesystem.

    The changes will be calculated from the last time you ran
    "ggt sync", "ggt push", or "ggt pull" in the chosen directory.

    If your local filesystem has also made changes since the last sync,
    you will be prompted to discard them or abort the pull.

    {bold USAGE}

      ggt pull [DIRECTORY] [--app=<name>] [--environment=<name>] [--force]

    {bold EXAMPLES}

      $ ggt pull
      $ ggt pull ~/gadget/example
      $ ggt pull ~/gadget/example --app=example
      $ ggt pull ~/gadget/example --app=example --environment=development
      $ ggt pull ~/gadget/example --app=example --environment=development --force

    {bold ARGUMENTS}

      DIRECTORY
        The path to the directory to pull files to.

        Defaults to the current working directory. (default: ".")

    {bold FLAGS}

      -a, --app=<name>
        The Gadget application to pull files to.

        If not provided, the application will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found, you will be
        prompted to choose an application from your list of apps.

      --force
        If the Gadget environment made changes since the last sync, they
        will be discarded without confirmation.
  `;
};

export const command: Command<PullArgs> = async (ctx) => {
  const filesync = await FileSync.init(ctx);
  await filesync.pull();
};
