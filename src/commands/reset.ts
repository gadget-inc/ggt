import arg from "arg";
import {
  FileSync,
  getFileChanges,
  getFileConflicts,
  printFileChanges,
  reverseLocalConflicts,
  type FileChange,
} from "../services/filesync.js";
import { println, printlns, sprint } from "../services/print.js";
import { confirm } from "../services/prompt.js";
import { getUserOrLogin } from "../services/user.js";
import type { Command } from "./index.js";

export const usage = sprint`
    TODO

    {bold USAGE}
      $ ggt reset

    {bold EXAMPLE}
      {gray $ ggt reset}
      TODO
`;

const argSpec = {
  "--only-conflicts": Boolean,
};

export const command: Command = async (rootArgs) => {
  const args = arg(argSpec, { argv: rootArgs._ });
  const user = await getUserOrLogin();
  const filesync = await FileSync.init(user, { dir: args._[0] });
  const { filesVersionHashes, gadgetHashes, localHashes } = await filesync.hashes();

  const localChanges = getFileChanges({ from: filesVersionHashes, to: localHashes });
  if (localChanges.length === 0) {
    printlns("You don't have any changes to reset.");
    return;
  }

  let changes: FileChange[];

  if (args["--only-conflicts"]) {
    const gadgetChanges = getFileChanges({ from: filesVersionHashes, to: gadgetHashes });
    const conflicts = getFileConflicts({ localChanges, gadgetChanges });
    if (conflicts.length === 0) {
      printlns`{bold You don't have any conflicting changes with Gadget.}`;
      return;
    }

    changes = reverseLocalConflicts(conflicts);
    printlns`{bold Resetting conflicting local changes}`;
  } else {
    changes = getFileChanges({ from: localHashes, to: filesVersionHashes });
    printlns`{bold Resetting all local changes}`;
  }

  printlns`{bold The following changes will be made to your local filesystem}`;
  printFileChanges({ changes });
  await confirm({ message: "Are you sure you want to make these changes?" });

  const { files } = await filesync.getFilesFromGadget({
    filesVersion: filesync.filesVersion,
    paths: changes.filter((change) => change.type !== "delete").map((change) => change.path),
  });

  await filesync.writeToLocalFilesystem({
    filesVersion: filesync.filesVersion,
    delete: changes.filter((change) => change.type === "delete").map((change) => change.path),
    files,
  });

  println`{green Done!} ✨`;
};
