import arg from "arg";
import { getChanges, getNecessaryChanges } from "src/services/filesync/hashes.js";
import { AppArg } from "../services/args.js";
import { Delete, printChangesToMake } from "../services/filesync/changes.js";
import { getConflicts, printConflicts } from "../services/filesync/conflicts.js";
import { FileSync } from "../services/filesync/filesync.js";
import { println, printlns, sprint } from "../services/print.js";
import { confirm } from "../services/prompt.js";
import { getUserOrLogin } from "../services/user.js";
import type { Command } from "./index.js";

export const usage = sprint`
    TODO

    {bold USAGE}
      $ ggt pull

    {bold EXAMPLE}
      {gray $ ggt pull}
      TODO
`;

const argSpec = {
  "-a": "--app",
  "--app": AppArg,
  "--force": Boolean,
};

export const command: Command = async (rootArgs) => {
  const args = arg(argSpec, { argv: rootArgs._ });

  const filesync = await FileSync.init({
    user: await getUserOrLogin(),
    dir: args._[0],
    app: args["--app"],
    force: args["--force"],
  });

  const { filesVersionHashes, localHashes, gadgetHashes, gadgetFilesVersion } = await filesync.getHashes();

  const gadgetChanges = getChanges({ from: filesVersionHashes, to: gadgetHashes });
  if (gadgetChanges.size === 0) {
    printlns("You already have the latest changes from Gadget.");
    return;
  }

  const localChanges = getChanges({ from: filesVersionHashes, to: localHashes });
  const conflicts = getConflicts({ localChanges, gadgetChanges });
  if (conflicts.size > 0) {
    printlns`{bold You have conflicting changes with Gadget}`;

    printConflicts({ conflicts });

    if (!args["--force"]) {
      printlns`
        {bold You must either}

          1. Pull with {bold --force} and overwrite your conflicting changes

             {gray ggt pull --force}

          2. Manually resolve the conflicts and try again
      `;

      // TODO: just return 1 or throw ExitCode
      process.exit(1);
    }
  }

  const changes = getNecessaryChanges({ changes: gadgetChanges, existing: localHashes });

  if (!filesync.directory.wasEmpty) {
    printlns`{bold The following changes will be made to your local filesystem}`;
    printChangesToMake({ changes });
    await confirm({ message: "Are you sure you want to make these changes?" });
  }

  const changed = [];
  const deleted = [];

  for (const [path, change] of changes) {
    if (change instanceof Delete) {
      deleted.push(path);
    } else {
      changed.push(path);
    }
  }

  const { files } = await filesync.getFilesFromGadget({ filesVersion: gadgetFilesVersion, paths: changed });
  await filesync.writeToLocalFilesystem({ filesVersion: gadgetFilesVersion, delete: deleted, files });

  println`{green Done!} ✨`;
};
