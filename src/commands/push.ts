import arg from "arg";
import fs from "fs-extra";
import pMap from "p-map";
import { EditGraphQL, PUBLISH_FILE_SYNC_EVENTS_MUTATION } from "src/services/edit-graphql.js";
import { FileSyncEncoding, type FileSyncChangedEventInput, type FileSyncDeletedEventInput } from "../__generated__/graphql.js";
import { AppArg } from "../services/args.js";
import { compact } from "../services/collections.js";
import { FileHashes, FileSync } from "../services/filesync.js";
import { createLogger } from "../services/log.js";
import { println, println2, sprint } from "../services/output.js";
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

const log = createLogger("push");

export const run = async (rootArgs: RootArgs) => {
  const args = arg(argSpec, { argv: rootArgs._ });
  const user = await getUserOrLogin();
  const filesync = await FileSync.init(user, { dir: args._[0], app: args["--app"], force: args["--force"] });
  const graphql = new EditGraphQL(filesync.app);
  const fileHashes = await FileHashes.load(filesync, graphql);

  log.info("file hashes", fileHashes);

  if (fileHashes.remoteChanges.length === 0) {
    println("Your Gadget files are already up to date!");
    return;
  }

  println2`{bold The following changes will be sent to Gadget}`;
  fileHashes.remoteChanges.printChangesToMake();

  const yes = await confirm({ message: "Are you sure you want to make these changes?" });
  if (!yes) {
    return;
  }

  const deleted: FileSyncDeletedEventInput[] = fileHashes.remoteChanges.deleted.map((path) => ({ path }));

  const changed: FileSyncChangedEventInput[] = compact(
    await pMap([...fileHashes.remoteChanges.added, ...fileHashes.remoteChanges.changed], async (normalizedPath) => {
      const absolutePath = filesync.absolute(normalizedPath);
      const stats = await fs.stat(absolutePath);
      return {
        path: normalizedPath,
        mode: stats.mode,
        content: stats.isDirectory() ? "" : await fs.readFile(absolutePath, FileSyncEncoding.Base64),
        encoding: FileSyncEncoding.Base64,
      };
    }),
  );

  const {
    publishFileSyncEvents: { remoteFilesVersion },
  } = await graphql.query({
    query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
    variables: { input: { expectedRemoteFilesVersion: String(fileHashes.remoteFilesVersion), changed, deleted } },
  });

  await filesync.write({ filesVersion: remoteFilesVersion, write: [], delete: [] });

  println`
    {green Done!} ✨
  `;
};
