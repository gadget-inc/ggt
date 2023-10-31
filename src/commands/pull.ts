import arg from "arg";
import { getFileChanges, getHashes, getNecessaryFileChanges } from "src/services/filesync/hashes.js";
import { AppArg } from "../services/args.js";
import { printChanges } from "../services/filesync/changes.js";
import { getFileConflicts, printConflicts } from "../services/filesync/conflicts.js";
import { FileSync } from "../services/filesync/shared.js";
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
  const user = await getUserOrLogin();
  const filesync = await FileSync.init(user, { dir: args._[0], app: args["--app"], force: args["--force"] });
  const { filesVersionHashes, localHashes, gadgetHashes, gadgetFilesVersion } = await getHashes({ filesync });

  const gadgetChanges = getFileChanges({ from: filesVersionHashes, to: gadgetHashes });
  if (gadgetChanges.length === 0) {
    printlns("You already have the latest changes from Gadget.");
    return;
  }

  const localChanges = getFileChanges({ from: filesVersionHashes, to: localHashes });
  const conflicts = getFileConflicts({ localChanges, gadgetChanges });
  if (conflicts.length > 0) {
    printlns`{bold You have conflicting changes with Gadget}`;

    printConflicts(conflicts);

    if (!args["--force"]) {
      printlns`
        {bold You must either}

          1. Pull with {bold --force} and overwrite your conflicting changes

             {gray ggt pull --force}

          2. Discard your conflicting changes

             {gray ggt reset --only-conflicts}

          3. Manually resolve the conflicts and try again
      `;

      // TODO: just return 1 or throw ExitCode
      process.exit(1);
    }
  }

  const changes = getNecessaryFileChanges({ changes: gadgetChanges, existing: localHashes });

  if (!filesync.wasEmpty) {
    printlns`{bold The following changes will be made to your local filesystem}`;
    printChanges({ changes });
    await confirm({ message: "Are you sure you want to make these changes?" });
  }

  const { files } = await filesync.getFilesFromGadget({
    filesVersion: gadgetFilesVersion,
    paths: changes.filter((change) => change.type !== "delete").map((change) => change.path),
  });

  await filesync.writeToLocalFilesystem({
    filesVersion: gadgetFilesVersion,
    delete: changes.filter((change) => change.type === "delete").map((change) => change.path),
    files,
  });

  println`{green Done!} ✨`;
};
