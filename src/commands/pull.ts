import arg from "arg";
import { FileSyncEncoding } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import { EditGraphQL } from "../services/edit-graphql.js";
import { FILES_QUERY, FILE_HASHES_QUERY, FileSync, diffFileHashes, fileHashes, printPaths } from "../services/filesync.js";
import { createLogger } from "../services/log.js";
import { println, sprint } from "../services/output.js";
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

  const [local, { hashes: remote, filesVersion }] = await Promise.all([
    fileHashes(filesync),
    graphql.query({ query: FILE_HASHES_QUERY }).then((data) => data.fileHashes),
  ]);

  const diff = diffFileHashes(local, remote as Record<string, string>);
  log.info("diff", { local, remote, diff });

  if (diff.changed.length === 0 && diff.added.length === 0 && diff.deleted.length === 0) {
    println("Your local files are already up to date!");
    return;
  }

  if (!filesync.wasEmpty) {
    // the directory wasn't empty, so we should confirm before pulling
    printPaths("←", diff.added, diff.changed, diff.deleted, { limit: Infinity });
    const yes = await confirm({ message: "Would you like to pull these changes?" });
    if (!yes) {
      return;
    }
  }

  const {
    files: { files },
  } = await graphql.query({
    query: FILES_QUERY,
    variables: {
      filesVersion,
      paths: [...diff.changed, ...diff.added],
      encoding: FileSyncEncoding.Base64,
    },
  });

  await filesync.write(filesVersion, files, diff.deleted);

  println`
    {green Done!} ✨
  `;
};
