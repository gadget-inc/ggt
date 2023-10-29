import arg from "arg";
import { AppArg } from "../services/args.js";
import { FileSync, type FileHashes } from "../services/filesync.js";
import { createLogger } from "../services/log.js";
import { println, printlns, sprint } from "../services/print.js";
import { confirm } from "../services/prompt.js";
import { getUserOrLogin } from "../services/user.js";
import type { RootArgs } from "./root.js";

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

const log = createLogger("pull");

export const run = async (rootArgs: RootArgs) => {
  const args = arg(argSpec, { argv: rootArgs._ });
  const user = await getUserOrLogin();
  const filesync = await FileSync.init(user, { dir: args._[0], app: args["--app"], force: args["--force"] });
  const fileHashes = await filesync.fileHashes.unwrap();

  log.info("file hashes", fileHashes);

  if (fileHashes.localChanges.length > 0 && !args["--force"]) {
    printlns`{bold The following changes have been made to your local filesystem since the last sync}`;
    fileHashes.localChanges.printChangesMade();

    println`
      {bold You must either:}

        1. Discard your changes and reset your local filesystem back to the last sync

             {gray ggt reset}

        2. Run pull again with the {bold --force} flag to discard your local changes

            {gray ggt pull --force}
    `;

    // TODO: just return 1 here instead of exiting
    process.exit(1);
  }

  if (fileHashes.localToGadget.length === 0) {
    println("Your local files are already up to date!");
    return;
  }

  if (!filesync.wasEmpty) {
    // the directory wasn't empty, so we should confirm before pulling
    printlns`{bold The following changes will be made to your local filesystem}`;
    fileHashes.localToGadget.print();

    const yes = await confirm({ message: "Are you sure you want to make these changes?" });
    if (!yes) {
      return;
    }
  }

  await pull(filesync, fileHashes);

  println`
    {green Done!} ✨
  `;
};

export const pull = async (filesync: FileSync, fileHashes: FileHashes) => {
  const { filesVersion, files } = await filesync.getFilesFromGadget({
    filesVersion: fileHashes.gadgetFilesVersion,
    paths: [...fileHashes.localToGadget.change, ...fileHashes.localToGadget.add],
  });

  await filesync.writeChangesToLocalFilesystem({
    filesVersion,
    write: files,
    delete: fileHashes.localToGadget.delete,
  });
};
