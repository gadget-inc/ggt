import arg from "arg";
import { AppArg } from "../services/args.js";
import { FileSync, type FilesToChange } from "../services/filesync.js";
import { println, printlns, sprint } from "../services/print.js";
import { confirm } from "../services/prompt.js";
import { getUserOrLogin } from "../services/user.js";
import type { Run } from "./index.js";

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

export const run: Run = async (rootArgs) => {
  const args = arg(argSpec, { argv: rootArgs._ });
  const user = await getUserOrLogin();
  const filesync = await FileSync.init(user, { dir: args._[0], app: args["--app"], force: args["--force"] });
  const { gadgetFilesVersion, localChanges, gadgetToLocal } = await filesync.changes();

  if (localChanges.length > 0 && !args["--force"]) {
    printlns`{bold The following changes have been made to your local filesystem since the last sync}`;
    localChanges.print();

    printlns`
      {bold You must either:}

        Discard your changes and reset your local filesystem back to the last sync

          {gray ggt reset}

        Pull again with the {bold --force} flag to discard your local changes

         {gray ggt pull --force}
    `;

    // TODO: just return 1 here instead of exiting
    process.exit(1);
  }

  if (gadgetToLocal.length === 0) {
    println("Your local files are already up to date!");
    return;
  }

  if (!filesync.wasEmpty) {
    // the directory wasn't empty, so we should confirm before pulling
    printlns`{bold The following changes will be made to your local filesystem}`;
    gadgetToLocal.print();

    const yes = await confirm({ message: "Are you sure you want to make these changes?" });
    if (!yes) {
      return;
    }
  }

  await pull({ filesync, gadgetToLocal, gadgetFilesVersion });

  println`
    {green Done!} ✨
  `;
};

export const pull = async ({
  filesync,
  gadgetToLocal,
  gadgetFilesVersion,
}: {
  filesync: FileSync;
  gadgetToLocal: FilesToChange;
  gadgetFilesVersion: bigint;
}): Promise<void> => {
  const { files } = await filesync.getFilesFromGadget({
    filesVersion: gadgetFilesVersion,
    paths: [...gadgetToLocal.change, ...gadgetToLocal.add],
  });

  await filesync.changeLocalFilesystem({
    filesVersion: gadgetFilesVersion,
    delete: gadgetToLocal.delete,
    files,
  });
};
