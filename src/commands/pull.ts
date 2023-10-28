import arg from "arg";
import { AppArg } from "../services/args.js";
import { FileSync, type FileHashes } from "../services/filesync.js";
import { createLogger } from "../services/log.js";
import { println, println2, sprint } from "../services/output.js";
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

  if (fileHashes.localToLocalOriginChanges.length > 0 && !args["--force"]) {
    println2`{bold The following changes have been made to your local filesystem since the last sync}`;
    fileHashes.localToLocalOriginChanges.printChangesMade();

    println`
      {bold You must either:}

        1. Reset your local filesystem to the last time you ran file sync.

             {gray ggt reset}

        2. Re-run this command again with the {bold --force} flag.

            {gray ggt pull --force}
    `;

    // TODO: just return 1 here instead of exiting
    process.exit(1);
  }

  if (fileHashes.latestOriginToLocalChanges.length === 0) {
    println("Your local files are already up to date!");
    return;
  }

  if (!filesync.wasEmpty) {
    // the directory wasn't empty, so we should confirm before pulling
    println2`{bold The following changes will be made to your local filesystem}`;
    fileHashes.latestOriginToLocalChanges.printChangesToMake();

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
    filesVersion: fileHashes.latestFilesVersionFromOrigin,
    paths: [...fileHashes.latestOriginToLocalChanges.changed, ...fileHashes.latestOriginToLocalChanges.added],
  });

  await filesync.writeChangesToLocalFilesystem({
    filesVersion,
    write: files,
    delete: fileHashes.latestOriginToLocalChanges.deleted,
  });
};
