import arg from "arg";
import fs from "fs-extra";
import pMap from "p-map";
import { FileSyncEncoding } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import { FileChanges, FileSync } from "../services/filesync.js";
import { println, println2, sprint } from "../services/print.js";
import { confirm } from "../services/prompt.js";
import { getUserOrLogin } from "../services/user.js";
import type { RootArgs } from "./root.js";

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

export const run = async (rootArgs: RootArgs) => {
  const args = arg(argSpec, { argv: rootArgs._ });
  const user = await getUserOrLogin();
  const filesync = await FileSync.init(user, { dir: args._[0], app: args["--app"], force: args["--force"] });
  const { localFromGadget, gadgetFilesVersion, gadgetFromLocal, gadgetFromFilesVersion } = await filesync.fileHashes.unwrap();

  if (localFromGadget.length === 0) {
    println("Your Gadget files are already up to date!");
    return;
  }

  if (filesync.filesVersion !== gadgetFilesVersion) {
    // we don't have the latest changes from Gadget, so make sure the
    // files that have been changed locally don't conflict with the
    // changes that have been made on Gadget
    const conflicts = gadgetFromLocal.conflictsWith(gadgetFromFilesVersion);
    if (conflicts.length > 0 && !args["--force"]) {
      fs.outputJsonSync(
        "tmp/push.json",
        { conflicts, localFromGadget, gadgetFilesVersion, gadgetFromLocal, gadgetFromFilesVersion },
        { spaces: 2 },
      );

      println2`{bold The following conflicts must be resolved before you can push your changes to Gadget}`;
      conflicts.print();
      process.exit(1);
    }
  }

  println2`{bold The following changes will be sent to Gadget}`;
  localFromGadget.printChangesToMake();

  const yes = await confirm({ message: "Are you sure you want to make these changes?" });
  if (!yes) {
    return;
  }

  await push({ filesync, localFromGadget });

  println`
    {green Done!} ✨
  `;
};

export const push = async ({ filesync, localFromGadget }: { filesync: FileSync; localFromGadget: FileChanges }) => {
  await filesync.sendChangesToGadget({
    deleted: localFromGadget.deleted,
    changed: await pMap([...localFromGadget.added, ...localFromGadget.changed], async (normalizedPath) => {
      const absolutePath = filesync.absolute(normalizedPath);
      const stats = await fs.stat(absolutePath);
      return {
        path: normalizedPath,
        mode: stats.mode,
        content: stats.isDirectory() ? "" : await fs.readFile(absolutePath, FileSyncEncoding.Base64),
        encoding: FileSyncEncoding.Base64,
      };
    }),
  });
};
