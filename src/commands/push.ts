import arg from "arg";
import fs from "fs-extra";
import pMap from "p-map";
import { FileSyncEncoding } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import { FileConflicts, FileSync, type FilesToChange } from "../services/filesync.js";
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
  const { localChanges, gadgetChanges, localToGadget } = await filesync.hashes();

  if (localChanges.length === 0) {
    printlns("You don't have any changes to push to Gadget.");
    return;
  }

  const conflicts = new FileConflicts(localChanges, gadgetChanges);
  if (conflicts.length > 0 && !args["--force"]) {
    printlns`{bold.underline You have conflicting changes with Gadget}`;

    conflicts.print();

    printlns`
      {bold.underline You must either}

        1. Push with {bold --force} and overwrite Gadget's conflicting changes

           {gray ggt push --force}

        2. Pull with {bold --force} and overwrite your conflicting changes

           {gray ggt pull --force}

        3. Manually resolve the conflicts and try again
    `;

    process.exit(1);
  }

  printlns`{bold.underline The following changes will be sent to Gadget}`;
  localToGadget.print();

  const yes = await confirm({ message: "Are you sure you want to make these changes?" });
  if (!yes) {
    return;
  }

  await push({ filesync, localToGadget });

  println`
    {green Done!} ✨
  `;
};

export const push = async ({ filesync, localToGadget }: { filesync: FileSync; localToGadget: FilesToChange }): Promise<void> => {
  await filesync.sendChangesToGadget({
    deleted: localToGadget.delete,
    changed: await pMap([...localToGadget.add, ...localToGadget.change], async (normalizedPath) => {
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
