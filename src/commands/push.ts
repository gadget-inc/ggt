import arg from "arg";
import fs from "fs-extra";
import pMap from "p-map";
import { FileSyncEncoding } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import { FileConflicts, FileSync, type FilesToChange } from "../services/filesync.js";
import { println, printlns, sprint } from "../services/print.js";
import { confirm } from "../services/prompt.js";
import { getUserOrLogin } from "../services/user.js";
import type { Run } from "./index.js";

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

export const run: Run = async (rootArgs) => {
  const args = arg(argSpec, { argv: rootArgs._ });
  const user = await getUserOrLogin();
  const filesync = await FileSync.init(user, { dir: args._[0], app: args["--app"], force: args["--force"] });
  const { localChanges, gadgetChanges, localToGadget: gadgetToLocal } = await filesync.changes();

  if (localChanges.length === 0) {
    println("You don't have any changes to push to Gadget.");
    return;
  }

  // make sure the files that have been changed locally don't conflict
  // with the changes that have been made on Gadget
  const conflicts = new FileConflicts(localChanges, gadgetChanges);
  if (conflicts.length > 0 && !args["--force"]) {
    printlns`{bold You have conflicting changes with Gadget}`;
    conflicts.print();

    printlns`
      {bold You must either}

        Pull the changes from Gadget and resolve the conflicts

            {gray ggt pull}

        Push again with the {bold --force} flag and overwrite Gadget's changes

            {gray ggt push --force}
    `;

    process.exit(1);
  }

  printlns`{bold The following changes will be sent to Gadget}`;
  gadgetToLocal.print();

  const yes = await confirm({ message: "Are you sure you want to make these changes?" });
  if (!yes) {
    return;
  }

  await push({ filesync, gadgetToLocal });

  println`
    {green Done!} ✨
  `;
};

export const push = async ({ filesync, gadgetToLocal }: { filesync: FileSync; gadgetToLocal: FilesToChange }): Promise<void> => {
  await filesync.sendChangesToGadget({
    deleted: gadgetToLocal.delete,
    changed: await pMap([...gadgetToLocal.add, ...gadgetToLocal.change], async (normalizedPath) => {
      const absolutePath = filesync.absolute(normalizedPath);
      const stats = await fs.stat(absolutePath);

      let content = "";
      if (stats.isFile()) {
        content = await fs.readFile(absolutePath, FileSyncEncoding.Base64);
      }

      return {
        content,
        path: normalizedPath,
        mode: stats.mode,
        encoding: FileSyncEncoding.Base64,
      };
    }),
  });
};
