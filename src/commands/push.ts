import type { ArgsDefinition } from "../services/command/arg.js";
import type { Command, Usage } from "../services/command/command.js";
import { FileSync, FileSyncArgs } from "../services/filesync/filesync.js";
import { FileSyncStrategy } from "../services/filesync/strategy.js";
import { sprint } from "../services/output/sprint.js";

export type PushArgs = typeof args;

export const args = {
  ...FileSyncArgs,
} satisfies ArgsDefinition;

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Push your local filesystem to your Gadget environment's filesystem.

      {bold USAGE}
        ggt push [DIRECTORY]

      {bold EXAMPLES}
        $ ggt push
        $ ggt push ~/gadget/example
        $ ggt push ~/gadget/example --app=example
        $ ggt push ~/gadget/example --app=example --environment=development

      {bold ARGUMENTS}
        DIRECTORY                  The directory to push files from (default: ".")

      {bold FLAGS}
        -a, --app=<name>           The Gadget application to push files to
        -e, --environment=<name>   The Gadget environment to push files to
            --force                Discard Gadget's changes

        Run "ggt push --help" for more information.
    `;
  }

  return sprint`
    Push your local filesystem to your Gadget environment's filesystem.

    {bold USAGE}

      ggt push [DIRECTORY] [--app=<name>] [--environment=<name>] [--force]

    {bold EXAMPLES}

      $ ggt push
      $ ggt push ~/gadget/example
      $ ggt push ~/gadget/example --app=example
      $ ggt push ~/gadget/example --app=example --environment=development
      $ ggt push ~/gadget/example --app=example --environment=development --force

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
        TODO
  `;
};

export const command: Command<PushArgs> = async (ctx) => {
  const filesync = await FileSync.init(ctx);
  await filesync.sync({ strategy: FileSyncStrategy.PUSH });
};
