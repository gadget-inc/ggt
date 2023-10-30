import arg from "arg";
import { AppArg } from "../services/args.js";
import { FileConflicts, FileSync, type ChangedFiles } from "../services/filesync.js";
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
  const { gadgetFilesVersion, gadgetChanges, localChanges } = await filesync.changes();

  if (gadgetChanges.length === 0) {
    println("Your local files are already up to date!");
    return;
  }

  const conflicts = new FileConflicts(localChanges, gadgetChanges);
  if (conflicts.length > 0 && !args["--force"]) {
    printlns`{bold.underline You have conflicting changes with Gadget}`;

    conflicts.print();

    printlns`
      {bold.underline You must either:}

        1. Resolve the conflicts and pull again

        2. Pull with {bold --force} and overwrite your conflicting changes

           {gray ggt pull --force}

        2. Reset your local changes and pull again

           {gray ggt reset}
           {gray ggt pull}
    `;

    // TODO: just return 1 here instead of exiting
    process.exit(1);
  }

  if (!filesync.wasEmpty) {
    printlns`{bold The following changes will be made to your local filesystem}`;
    gadgetChanges.print();

    const yes = await confirm({ message: "Are you sure you want to make these changes?" });
    if (!yes) {
      return;
    }
  }

  await pull({ filesync, gadgetChanges, gadgetFilesVersion });

  println`
    {green Done!} ✨
  `;
};

export const pull = async ({
  filesync,
  gadgetChanges,
  gadgetFilesVersion,
}: {
  filesync: FileSync;
  gadgetChanges: ChangedFiles;
  gadgetFilesVersion: bigint;
}): Promise<void> => {
  const { files } = await filesync.getFilesFromGadget({
    filesVersion: gadgetFilesVersion,
    paths: [...gadgetChanges.changed, ...gadgetChanges.added],
  });

  await filesync.changeLocalFilesystem({
    filesVersion: gadgetFilesVersion,
    delete: gadgetChanges.deleted,
    files,
  });
};
