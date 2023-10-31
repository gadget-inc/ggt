import arg from "arg";
import fs from "fs-extra";
import pMap from "p-map";
import { FileSyncEncoding } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import {
  FileSync,
  getFileChanges,
  getFileConflicts,
  getNecessaryFileChanges,
  printFileChanges,
  printFileConflicts,
  type FileChange,
} from "../services/filesync.js";
import { println, printlns, sprint } from "../services/print.js";
import { confirm } from "../services/prompt.js";
import { getUserOrLogin } from "../services/user.js";
import type { Command } from "./index.js";

export const usage = sprint`
    TODO

    {bold USAGE}
      $ ggt push

    {bold EXAMPLE}
      {gray $ ggt push}
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
  const { gadgetFilesVersion, filesVersionHashes, gadgetHashes, localHashes } = await filesync.hashes();

  const localChanges = getFileChanges({ from: filesVersionHashes, to: localHashes });
  if (localChanges.length === 0) {
    printlns("You don't have any changes to push to Gadget.");
    return;
  }

  const gadgetChanges = getFileChanges({ from: filesVersionHashes, to: gadgetHashes });
  const conflicts = getFileConflicts({ localChanges, gadgetChanges });
  if (conflicts.length > 0) {
    printlns`{bold You have conflicting changes with Gadget}`;
    printFileConflicts(conflicts);

    if (!args["--force"]) {
      printlns`
        {bold You must either}

          1. Push with {bold --force} and overwrite Gadget's conflicting changes

             {gray ggt push --force}

          2. Pull with {bold --force} and overwrite your conflicting changes

             {gray ggt pull --force}

          3. Manually resolve the conflicts and try again
      `;

      process.exit(1);
    }
  }

  const changes = getNecessaryFileChanges({ changes: localChanges, existing: gadgetHashes });

  printlns`{bold The following changes will be sent to Gadget}`;
  printFileChanges({ changes });

  const yes = await confirm({ message: "Are you sure you want to make these changes?" });
  if (!yes) {
    return;
  }

  await push({ filesync, changes });

  println`{green Done!} ✨`;
};

export const push = async ({ filesync, changes }: { filesync: FileSync; changes: FileChange[] }): Promise<void> => {
  await filesync.sendChangesToGadget({
    deleted: changes.filter((change) => change.type === "delete").map((change) => change.path),
    changed: await pMap(
      changes.filter((change) => change.type !== "delete"),
      async (change) => {
        const absolutePath = filesync.absolute(change.path);
        const stats = await fs.stat(absolutePath);

        let content = "";
        if (stats.isFile()) {
          content = await fs.readFile(absolutePath, FileSyncEncoding.Base64);
        }

        return {
          content,
          path: change.path,
          mode: stats.mode,
          encoding: FileSyncEncoding.Base64,
        };
      },
    ),
  });
};
