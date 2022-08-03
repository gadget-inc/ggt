import { Flags } from "@oclif/core";
import type { OutputFlags } from "@oclif/core/lib/interfaces";
import { CLIError } from "@oclif/errors";
import assert from "assert";
import { FSWatcher } from "chokidar";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import { prompt } from "inquirer";
import { debounce } from "lodash";
import pMap from "p-map";
import PQueue from "p-queue";
import path from "path";
import type { InterpreterFrom } from "xstate";
import { createMachine, interpret } from "xstate";
import { BaseCommand } from "../lib/base-command";
import type { Query } from "../lib/client";
import { GraphQLClient } from "../lib/client";
import { Config } from "../lib/config";
import { ignoreEnoent } from "../lib/enoent";
import { Ignorer } from "../lib/ignorer";
import { logger } from "../lib/logger";
import { walkDir, WalkedTooManyFilesError } from "../lib/walk-dir";
import type {
  FileSyncChangedEventInput,
  FileSyncDeletedEventInput,
  PublishFileSyncEventsMutation,
  PublishFileSyncEventsMutationVariables,
  RemoteFilesVersionQuery,
  RemoteFilesVersionQueryVariables,
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables,
} from "../__generated__/graphql";
import type { Typegen0 as SyncMachine } from "../__generated__/sync.typegen";

// eslint-disable-next-line jsdoc/require-jsdoc
export default class Sync extends BaseCommand {
  static override summary = "Sync your Gadget app's source files to your local file system.";

  static override usage = "sync --app <name> [DIRECTORY]";

  static override args = [
    {
      name: "directory",
      description: "The directory to sync files to. If the directory doesn't exist, it will be created.",
      default: ".",
    },
  ];

  static override flags = {
    app: Flags.string({
      char: "a",
      summary: "Name of the app to sync to files to.",
      helpValue: "name",
      required: true,
      parse: (value) => {
        const app = /^(https:\/\/)?(?<app>[\w-]+)(\..*)?/.exec(value)?.groups?.["app"];
        if (!app) throw new CLIError("Flag '-a, --app=<name>' is invalid");
        return app as any;
      },
    }),
    "file-push-delay": Flags.integer({
      summary: "Delay in milliseconds before pushing files to your app.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
    }),
    "file-stability-threshold": Flags.integer({
      name: "file-stability-threshold",
      summary: "Time in milliseconds a file's size must remain the same.",
      helpGroup: "file",
      helpValue: "ms",
      default: 500,
    }),
    "file-poll-interval": Flags.integer({
      name: "file-poll-interval",
      description: "Interval in milliseconds between polling a file's size.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
    }),
  };

  static override examples = [
    `$ ggt sync --app my-app ~/gadget/my-app
👀 set up local file watcher
📡 set up remote file subscription
✍️  wrote remote file changes
    total: 1
    files:
      - routes/GET.js
🚀 sent local file changes
    total: 1
    files:
      - routes/GET-ping.ts
  `,

    `# These are equivalent
$ ggt sync --app my-app
$ ggt sync --app my-app.gadget.app
$ ggt sync --app https://my-app.gadget.app `,
  ];

  override readonly requireUser = true;

  service!: InterpreterFrom<typeof machine>;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Sync);

    this.service ??= createService(args["directory"], flags);

    let stopping = false;
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        if (stopping) return;
        stopping = true;
        logger.info(" Stopping sync (press Ctrl+C again to force)");
        this.service.send({ type: "STOP" });
      });
    }

    this.service.start();

    await new Promise((resolve) => this.service.onDone(resolve));
  }
}

export enum Action {
  CANCEL = "Cancel sync and do nothing",
  MERGE = "Merge local files with remote",
  RESET = "Reset local files to remote",
}

export const machine = createMachine(
  {
    // this file is automatically generated when you use the `statelyai.stately-vscode` extension in vscode (recommended)
    // you can manually generate it by running `yarn run typegen`
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    tsTypes: {} as SyncMachine,
    schema: {
      events: {} as { type: "IDLE" } | { type: "WRITE" } | { type: "PUBLISH" } | { type: "STOP"; data?: unknown },
      context: {} as {
        dir: string;
        relative: (to: string) => string;
        absolute: (...pathSegments: string[]) => string;
        recentWrites: Set<string>;
        filePushDelay: number;
        queue: PQueue;
        ignorer: Ignorer;
        client: GraphQLClient;
        watcher: FSWatcher;
        metadata: {
          lastWritten: {
            filesVersion: string;
            mtime: number;
          };
        };
      },
    },
    id: "sync",
    initial: "starting",
    strict: true,
    on: {
      STOP: "stopping",
    },
    states: {
      starting: {
        invoke: {
          id: "start",
          src: "start",
          onDone: "running",
          onError: "stopping",
        },
      },
      running: {
        initial: "idle",
        on: {
          IDLE: ".idle",
          WRITE: ".writing",
          PUBLISH: ".publishing",
        },
        invoke: [
          { id: "setup", src: "setup" },
          { id: "watch", src: "watch" },
          { id: "subscribe", src: "subscribe" },
        ],
        states: {
          idle: {},
          writing: {},
          publishing: {},
        },
      },
      stopping: {
        invoke: {
          id: "stop",
          src: "stop",
          onDone: "stopped",
        },
      },
      stopped: {
        type: "final",
      },
    },
  },
  {
    services: {
      start: async (context) => {
        logger.debug("⚙️  starting");
        await fs.ensureDir(context.dir);

        try {
          context.metadata = await fs.readJson(context.absolute(".ggt", "sync.json"));
        } catch (error) {
          // use defaults if the metadata file doesn't exist
          ignoreEnoent(error);

          const d = await fs.opendir(context.dir);
          if ((await d.read()) != null) {
            logger.warn("⚠️ Could not find .ggt/sync.json in a non empty directory");
          }
          await d.close();
        }

        const { remoteFilesVersion } = await context.client.unwrapQuery({ query: REMOTE_FILES_VERSION_QUERY });
        const hasRemoteChanges = BigInt(remoteFilesVersion) > BigInt(context.metadata.lastWritten.filesVersion);

        async function getChangedFiles(): Promise<Map<string, Stats>> {
          const files = new Map();
          for await (const filepath of walkDir(context.dir, { ignorer: context.ignorer, maxFiles: 100 })) {
            const stats = await fs.stat(filepath);
            if (stats.mtime.getTime() > context.metadata.lastWritten.mtime) {
              files.set(context.absolute(filepath), stats);
            }
          }
          return files;
        }

        const changedFiles = await getChangedFiles();
        const hasLocalChanges = changedFiles.size > 0;
        if (hasLocalChanges) {
          logger.info(
            { total: changedFiles.size, files: Array.from(changedFiles.keys()).map(context.relative) },
            `ℹ️️  The following local files have changed since the last sync:`
          );
        }

        logger.debug({ metadata: context.metadata, remoteFilesVersion, hasRemoteChanges, hasLocalChanges }, "⚙️  metadata");

        let action: Action | undefined;
        if (hasLocalChanges) {
          ({ action } = await prompt({
            type: "list",
            name: "action",
            choices: [Action.CANCEL, Action.MERGE, Action.RESET],
            message: hasRemoteChanges
              ? "Both local and remote files have changed since the last sync. How would you like to proceed?"
              : "Local files have changed since the last sync. How would you like to proceed?",
          }));
        }

        switch (action) {
          case Action.MERGE: {
            // get all the changed files again in case more changed
            const files = await getChangedFiles();

            // we purposefully don't set the returned remoteFilesVersion here because we haven't processed the in-between versions yet
            await context.client.unwrapQuery({
              query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
              variables: {
                input: {
                  expectedRemoteFilesVersion: remoteFilesVersion,
                  changed: await pMap(files, async ([filepath, stats]) => {
                    if (stats.mtime.getTime() > context.metadata.lastWritten.mtime) {
                      context.metadata.lastWritten.mtime = stats.mtime.getTime();
                    }

                    return {
                      path: context.relative(filepath),
                      mode: stats.mode,
                      content: await fs.readFile(filepath, "utf-8"),
                    };
                  }),
                  deleted: [],
                },
              },
            });
            break;
          }
          case Action.RESET: {
            await pMap(changedFiles, ([filepath]) => fs.remove(filepath));
            context.metadata.lastWritten.filesVersion = "0";
            break;
          }
          case Action.CANCEL: {
            process.exit(0);
          }
        }

        logger.debug("⚙️  started");
      },
      setup: (context) => (callback) => {
        context.queue.on("idle", () => callback({ type: "IDLE" }));
        return () => context.queue.removeAllListeners();
      },
      subscribe: (context) => (callback) => {
        logger.debug("📡 setting up remote file subscription...");

        const unsubscribe = context.client.subscribe(
          {
            query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
            variables: () => ({ localFilesVersion: context.metadata.lastWritten.filesVersion }),
          },
          {
            complete: () => callback({ type: "STOP", data: new Error("Unexpected disconnect") }),
            error: (error) => callback({ type: "STOP", data: error }),
            next: (response) => {
              if (!response.data?.remoteFileSyncEvents.changed.length && !response.data?.remoteFileSyncEvents.deleted.length) {
                if (response.errors) callback({ type: "STOP", data: new AggregateError(response.errors) });
                return;
              }

              const { remoteFilesVersion, changed, deleted } = response.data.remoteFileSyncEvents;
              const remoteFiles = new Map([...deleted, ...changed].map((e) => [e.path, e]));
              logger.debug({ remoteFilesVersion, total: remoteFiles.size, files: remoteFiles.keys() }, "📡 received remote file changes");

              void context.queue.add(async () => {
                callback({ type: "WRITE" });
                logger.debug(
                  { remoteFilesVersion, total: remoteFiles.size, files: remoteFiles.keys() },
                  "✍️  writing remote file changes..."
                );

                await pMap(
                  remoteFiles,
                  async ([relativePath, file]) => {
                    const filepath = context.absolute(relativePath);
                    context.recentWrites.add(filepath);

                    if ("content" in file) {
                      await fs.ensureDir(path.dirname(filepath), { mode: 0o755 });
                      if (!file.path.endsWith("/")) await fs.writeFile(filepath, file.content, { mode: file.mode });
                    } else {
                      await fs.remove(filepath);
                    }

                    if (filepath == context.ignorer.filepath) {
                      context.ignorer.reload();
                    }
                  },
                  { stopOnError: false }
                );

                context.metadata.lastWritten.filesVersion = remoteFilesVersion;
                logger.info({ total: remoteFiles.size, files: remoteFiles.keys() }, "✍️  wrote remote file changes");
              });
            },
          }
        );

        logger.info("📡 set up remote file subscription");

        return unsubscribe;
      },
      watch: (context) => (callback) => {
        logger.debug("👀 setting up local file watcher...");

        const localFilesBuffer = new Map<string, { mode: number; mtime: number } | false>();

        const publish = debounce(() => {
          const localFiles = new Map(localFilesBuffer.entries());
          localFilesBuffer.clear();

          void context.queue.add(async () => {
            callback({ type: "PUBLISH" });

            const changed: FileSyncChangedEventInput[] = [];
            const deleted: FileSyncDeletedEventInput[] = [];

            await pMap(
              localFiles,
              async ([filepath, file]) => {
                if (file) {
                  try {
                    changed.push({ path: context.relative(filepath), mode: file.mode, content: await fs.readFile(filepath, "utf-8") });
                  } catch (error) {
                    // A file could have been changed and then deleted before we process the change event, so the readFile above will raise
                    // an ENOENT. This is normal operation, so just ignore this event.
                    ignoreEnoent(error);
                  }
                } else {
                  deleted.push({ path: context.relative(filepath) });
                }
              },
              { stopOnError: false }
            );

            if (changed.length > 0 || deleted.length > 0) {
              const files = [...changed, ...deleted].map((e) => e.path);
              logger.debug({ total: files.length, files }, "🚀 sending local file changes...");

              const data = await context.client.unwrapQuery({
                query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
                variables: { input: { expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion, changed, deleted } },
              });

              const { remoteFilesVersion } = data.publishFileSyncEvents;
              logger.debug({ remoteFilesVersion }, "remote files version after publishing");

              if (BigInt(remoteFilesVersion) > BigInt(context.metadata.lastWritten.filesVersion)) {
                context.metadata.lastWritten.filesVersion = remoteFilesVersion;
              }

              logger.info({ total: files.length, files }, "🚀 sent local file changes");
            }
          });
        }, context.filePushDelay);

        context.watcher
          .add(`${context.dir}/**/*`)
          .on("error", (error) => callback({ type: "STOP", data: error }))
          .on("all", (event, filepath, stats) => {
            if (event === "addDir") {
              logger.trace({ path: context.relative(filepath), event, mode: stats?.mode }, "👀 skipping event caused by added directory");
              return;
            }

            if (stats?.isSymbolicLink?.()) {
              logger.trace({ path: context.relative(filepath), event, mode: stats.mode }, "👀 skipping event caused by symlink");
              return;
            }

            if (filepath == context.ignorer.filepath) {
              context.ignorer.reload();
            } else if (context.ignorer.ignores(filepath)) {
              logger.trace({ path: context.relative(filepath), event, mode: stats?.mode }, "👀 skipping event caused by ignored file");
              return;
            }

            // we only update the lastWritten.mtime if the file is not ignored, because if we restart and the lastWritten.mtime is set to an
            // ignored file, then it *could* be greater than the mtime of all non ignored files and we'll think that local files have
            // changed when only an ignored one has
            if (stats && stats.mtime.getTime() > context.metadata.lastWritten.mtime) {
              context.metadata.lastWritten.mtime = stats.mtime.getTime();
            }

            if (context.recentWrites.delete(filepath)) {
              logger.trace({ path: context.relative(filepath), event, mode: stats?.mode }, "👀 skipping event caused by recent write");
              return;
            }

            logger.trace({ path: context.relative(filepath), event, mode: stats?.mode }, "👀 file changed");

            switch (event) {
              case "add":
              case "change":
                assert(stats, "missing stats on add/change event");
                localFilesBuffer.set(filepath, { mode: stats.mode, mtime: stats.mtime.getTime() });
                break;
              case "unlink":
              case "unlinkDir":
                localFilesBuffer.set(filepath, false);
                break;
            }

            publish();
          });

        logger.info("👀 set up local file watcher");

        return () => {
          context.watcher.removeAllListeners();
          publish.flush();
        };
      },
      stop: async (context, event) => {
        try {
          logger.debug("⚙️  stopping");
          await context.queue.onIdle();

          if (!event.data) {
            logger.info("👋 Goodbye");
            return;
          }

          process.exitCode = 1;

          const error = event.data as Error;
          switch (true) {
            case error.message == "Unexpected server response: 401":
              Config.session = undefined;
              Config.save();

              logger.warn("⚠️ Session expired");
              logger.info("ℹ️ Run `ggt auth login` to login again");
              break;
            case error instanceof WalkedTooManyFilesError:
              logger.warn("⚠️ Too many files found while starting");
              logger.info("ℹ️ Consider adding more files to your .ignore file");
              break;
            default:
              logger.error({ error }, "🚨 Unexpected error");
          }
        } finally {
          await fs.outputJSON(context.absolute(".ggt", "sync.json"), context.metadata, { spaces: 2 });
          await Promise.allSettled([context.watcher.close(), context.client.dispose()]);
          logger.debug("⚙️  stopped");
        }
      },
    },
  }
);

export function createService(dir: string, options: OutputFlags<typeof Sync["flags"]>): InterpreterFrom<typeof machine> {
  dir = path.resolve(dir);

  // local files that should never be published
  const ignored = ["node_modules/", ".gadget/", ".ggt/", ".git/"];

  return interpret(
    machine.withContext({
      dir,
      relative: (to: string) => path.relative(dir, to),
      absolute: (...pathSegments: string[]) => path.resolve(dir, ...pathSegments),
      recentWrites: new Set(),
      filePushDelay: options["file-push-delay"],
      queue: new PQueue({ concurrency: 1 }),
      client: new GraphQLClient(options.app),
      ignorer: new Ignorer(dir, ignored),
      watcher: new FSWatcher({
        ignored,
        // don't emit an event for every watched file on boot
        ignoreInitial: true,
        // make sure stats are always present on add/change events
        alwaysStat: true,
        // wait for the entire file to be written before emitting add/change events
        awaitWriteFinish: { pollInterval: options["file-poll-interval"], stabilityThreshold: options["file-stability-threshold"] },
      }),
      metadata: {
        lastWritten: {
          filesVersion: "0",
          mtime: 0,
        },
      },
    })
  );
}

export const REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION: Query<
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables
> = /* GraphQL */ `
  subscription RemoteFileSyncEvents($localFilesVersion: String!) {
    remoteFileSyncEvents(localFilesVersion: $localFilesVersion) {
      remoteFilesVersion
      changed {
        path
        mode
        content
      }
      deleted {
        path
      }
    }
  }
`;

export const REMOTE_FILES_VERSION_QUERY: Query<RemoteFilesVersionQuery, RemoteFilesVersionQueryVariables> = /* GraphQL */ `
  query RemoteFilesVersion {
    remoteFilesVersion
  }
`;

export const PUBLISH_FILE_SYNC_EVENTS_MUTATION: Query<
  PublishFileSyncEventsMutation,
  PublishFileSyncEventsMutationVariables
> = /* GraphQL */ `
  mutation PublishFileSyncEvents($input: PublishFileSyncEventsInput!) {
    publishFileSyncEvents(input: $input) {
      remoteFilesVersion
    }
  }
`;
