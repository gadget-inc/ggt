import arg from "arg";
import fs from "fs-extra";
import pMap from "p-map";
import { getChanges, getNecessaryFileChanges } from "src/services/filesync/hashes.js";
import { FileSyncEncoding } from "../__generated__/graphql.js";
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

  const filesync = await FileSync.init({
    user: await getUserOrLogin(),
    dir: args._[0],
    app: args["--app"],
    force: args["--force"],
  });

  const { filesVersionHashes, localHashes, gadgetHashes, gadgetFilesVersion } = await filesync.getHashes();

  const localChanges = getChanges({ from: filesVersionHashes, to: localHashes });
  if (localChanges.size === 0) {
    printlns("You don't have any changes to push to Gadget.");
    return;
  }

  const gadgetChanges = getChanges({ from: filesVersionHashes, to: gadgetHashes });
  const conflicts = getConflicts({ localChanges, gadgetChanges });
  if (conflicts.size > 0) {
    printlns`{bold You have conflicting changes with Gadget}`;
    printConflicts(conflicts);

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
  printChangesToMake({ changes });
  await confirm({ message: "Are you sure you want to make these changes?" });

  const changed = [];
  const deleted = [];

  for (const [path, change] of changes) {
    if (change instanceof Delete) {
      deleted.push(path);
    } else {
      changed.push(path);
    }
  }

  await filesync.sendToGadget({
    expectedFilesVersion: gadgetFilesVersion,
    deleted,
    changed: await pMap(changed, async (path) => {
      const absolutePath = filesync.directory.absolute(path);
      const stats = await fs.stat(absolutePath);

      let content = "";
      if (stats.isFile()) {
        content = await fs.readFile(absolutePath, FileSyncEncoding.Base64);
      }

      return {
        path,
        content,
        mode: stats.mode,
        encoding: FileSyncEncoding.Base64,
      };
    }),
  });

  println`{green Done!} ✨`;
};
