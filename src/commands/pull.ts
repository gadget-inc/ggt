import arg from "arg";
import { EditGraphQL, FILES_QUERY } from "src/services/edit-graphql.js";
import { FileSyncEncoding } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import { FileHashes, FileSync } from "../services/filesync.js";
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
  const graphql = new EditGraphQL(filesync.app);
  const fileHashes = await FileHashes.load(filesync, graphql);

  log.info("file hashes", fileHashes);

  if (fileHashes.localChanges.length === 0) {
    println("Your local files are already up to date!");
    return;
  }

  if (!filesync.wasEmpty) {
    // the directory wasn't empty, so we should confirm before pulling
    println2`{bold The following changes will be made to your local filesystem}`;
    fileHashes.localChanges.printChangesToMake();

    const yes = await confirm({ message: "Are you sure you want to make these changes?" });
    if (!yes) {
      return;
    }
  }

  const {
    files: { files },
  } = await graphql.query({
    query: FILES_QUERY,
    variables: {
      filesVersion: String(fileHashes.remoteFilesVersion),
      paths: [...fileHashes.localChanges.changed, ...fileHashes.localChanges.added],
      encoding: FileSyncEncoding.Base64,
    },
  });

  await filesync.write({ filesVersion: fileHashes.remoteFilesVersion, write: files, delete: fileHashes.localChanges.deleted });

  println`
    {green Done!} ✨
  `;
};
