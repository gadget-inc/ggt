import { Flags } from "@oclif/core";
import chalk from "chalk";
import assert from "assert";
import { FSWatcher } from "chokidar";
import format from "date-fns/format";
import execa from "execa";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import { prompt } from "inquirer";
import type { DebouncedFunc } from "lodash";
import { sortBy } from "lodash";
import { isString } from "lodash";
import { debounce } from "lodash";
import normalizePath from "normalize-path";
import pMap from "p-map";
import PQueue from "p-queue";
import path from "path";
import pluralize from "pluralize";
import dedent from "ts-dedent";
import which from "which";
import { BaseCommand } from "../utils/base-command";
import type { Query } from "../utils/client";
import { Client } from "../utils/client";
import { context } from "../utils/context";
import { InvalidSyncAppFlagError, InvalidSyncFileError, YarnNotFoundError } from "../utils/errors";
import { app } from "../utils/flags";
import { ignoreEnoent, Ignorer, isEmptyDir, walkDir } from "../utils/fs-utils";
import { sleepUntil } from "../utils/sleep";
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
import { FileSyncEncoding } from "../__generated__/graphql";

export default class Sync extends BaseCommand {
  static override priority = 1;

  static override summary = "Sync your Gadget application's source code to and from your local filesystem.";

  static override usage = "sync [DIRECTORY] [--app <name>]";

  static override description = dedent(chalk`
    Sync provides the ability to sync your Gadget application's source code to and from your local
    filesystem. While {gray ggt sync} is running, local file changes are immediately reflected within
    Gadget, while files that are changed remotely are immediately saved to your local filesystem.

    Use cases for this include:
      - Developing locally with your own editor like VSCode {gray (https://code.visualstudio.com/)}
      - Storing your source code in a Git repository like GitHub {gray (https://github.com/)}

    Sync includes the concept of a {gray .ignore} file. This file may contain a list of files and
    directories that won't be received or sent to Gadget when syncing. The format of this file is
    identical to the one used by Git {gray (https://git-scm.com/docs/gitignore)}.

    The following files and directories are always ignored:
      - .gadget
      - .git
      - node_modules

    Note:
      - If you have separate development and production environments, {gray ggt sync} will only sync with your development environment
      - Gadget applications only support installing dependencies with Yarn 1 {gray (https://classic.yarnpkg.com/lang/en/)}
      - Since file changes are immediately reflected in Gadget, avoid the following while {gray ggt sync} is running:
          - Deleting all your files
          - Moving all your files to a different directory
  `);

  static override args = [
    {
      name: "directory",
      description: "The directory to sync files to. If the directory doesn't exist, it will be created.",
      default: ".",
    },
  ];

  static override flags = {
    app: app({
      summary: "The Gadget application to sync files to.",
    }),
    force: Flags.boolean({
      summary: "Whether to sync even if we can't determine the state of your local files relative to your remote ones.",
      default: false,
    }),
    "file-push-delay": Flags.integer({
      summary: "Delay in milliseconds before pushing files to your app.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
      hidden: true,
    }),
    "file-stability-threshold": Flags.integer({
      name: "file-stability-threshold",
      summary: "Time in milliseconds a file's size must remain the same.",
      helpGroup: "file",
      helpValue: "ms",
      default: 500,
      hidden: true,
    }),
    "file-poll-interval": Flags.integer({
      name: "file-poll-interval",
      description: "Interval in milliseconds between polling a file's size.",
      helpGroup: "file",
      helpValue: "ms",
      default: 100,
      hidden: true,
    }),
  };

  static override examples = [
    dedent(chalk`
      {gray $ ggt sync --app my-app ~/gadget/my-app}

      App         my-app
      Editor      https://my-app.gadget.app/edit
      Playground  https://my-app.gadget.app/api/graphql/playground
      Docs        https://docs.gadget.dev/api/my-app

      {underline Endpoints}
        - https://my-app.gadget.app
        - https://my-app--development.gadget.app

      Watching for file changes... {gray Press Ctrl+C to stop}

      Received {gray 12:00:00 PM}
      {green ←} routes/GET.js {gray (changed)}
      {green ←} user/signUp/signIn.js {gray (changed)}
      {gray 2 files in total. 2 changed, 0 deleted.}

      Sent {gray 12:00:03 PM}
      {green →} routes/GET.ts {gray (changed)}
      {gray 1 file in total. 1 changed, 0 deleted.}

      ^C Stopping... {gray (press Ctrl+C again to force)}
      Goodbye!
    `),
  ];

  override requireUser = true;

  status = SyncStatus.STARTING;

  dir!: string;

  recentWrites = new Set();

  filePushDelay!: number;

  queue = new PQueue({ concurrency: 1 });

  client!: Client;

  ignorer!: Ignorer;

  watcher!: FSWatcher;

  metadata = {
    app: "",
    filesVersion: "0",
    mtime: 0,
  };

  publish!: DebouncedFunc<() => void>;

  stop!: (error?: unknown) => Promise<void>;

  relative(to: string): string {
    return path.relative(this.dir, to);
  }

  absolute(...pathSegments: string[]): string {
    return path.resolve(this.dir, ...pathSegments);
  }

  normalize(filepath: string): string {
    return normalizePath(path.isAbsolute(filepath) ? this.relative(filepath) : filepath);
  }

  logPaths(prefix: string, changed: string[], deleted: string[], { limit = 10 } = {}): void {
    const lines = sortBy(
      [
        ...changed.map((filepath) => chalk`{green ${prefix}} ${this.normalize(filepath)} {gray (changed)}`),
        ...deleted.map((filepath) => chalk`{red ${prefix}} ${this.normalize(filepath)} {gray (deleted)}`),
      ],
      (line) => line.slice(line.indexOf(" ") + 1)
    );

    let logged = 0;
    for (const line of lines) {
      this.log(line);
      if (++logged == limit && !this.debugEnabled) break;
    }

    if (lines.length > logged) {
      this.log(chalk`{gray … ${lines.length - logged} more}`);
    }

    this.log(chalk`{gray ${pluralize("file", lines.length, true)} in total. ${changed.length} changed, ${deleted.length} deleted.}`);
    this.log();
  }

  override async init(): Promise<void> {
    await super.init();
    const { args, flags } = await this.parse(Sync);

    assert(isString(args["directory"]));

    this.dir =
      this.config.windows && args["directory"].startsWith("~/")
        ? path.join(this.config.home, args["directory"].slice(2))
        : path.resolve(args["directory"]);

    const getApp = async (): Promise<string> => {
      if (flags.app) return flags.app;
      if (this.metadata.app) return this.metadata.app;
      const selected = await prompt<{ app: string }>({
        type: "list",
        name: "app",
        message: "Please select the app to sync to.",
        choices: await context.getAvailableApps().then((apps) => apps.map((app) => app.slug)),
      });
      return selected.app;
    };

    if (await isEmptyDir(this.dir)) {
      this.metadata.app = await getApp();
    } else {
      try {
        this.metadata = await fs.readJson(this.absolute(".gadget", "sync.json"));
        if (!this.metadata.app) {
          this.metadata.app = await getApp();
        }
      } catch (error) {
        if (!flags.force) {
          throw new InvalidSyncFileError(error, this, flags.app);
        }
        this.metadata.app = await getApp();
      }
    }

    if (flags.app && flags.app !== this.metadata.app && !flags.force) {
      throw new InvalidSyncAppFlagError(this, flags.app);
    }

    await context.setApp(this.metadata.app);

    this.client = new Client();

    this.filePushDelay = flags["file-push-delay"];

    // local files/folders that should never be published
    this.ignorer = new Ignorer(this.dir, ["node_modules", ".gadget", ".git"]);

    this.watcher = new FSWatcher({
      ignored: (filepath) => this.ignorer.ignores(filepath),
      // don't emit an event for every watched file on boot
      ignoreInitial: true,
      // make sure stats are always present on add/change events
      alwaysStat: true,
      // wait for the entire file to be written before emitting add/change events
      awaitWriteFinish: { pollInterval: flags["file-poll-interval"], stabilityThreshold: flags["file-stability-threshold"] },
    });

    this.debug("starting");

    if (!which.sync("yarn", { nothrow: true })) {
      throw new YarnNotFoundError();
    }

    await fs.ensureDir(this.dir);

    const { remoteFilesVersion } = await this.client.queryUnwrap({ query: REMOTE_FILES_VERSION_QUERY });
    const hasRemoteChanges = BigInt(remoteFilesVersion) > BigInt(this.metadata.filesVersion);

    const getChangedFiles = async (): Promise<Map<string, Stats>> => {
      const files = new Map();
      for await (const filepath of walkDir(this.dir, { ignorer: this.ignorer })) {
        const stats = await fs.stat(filepath);
        if (stats.mtime.getTime() > this.metadata.mtime) {
          files.set(this.absolute(filepath), stats);
        }
      }
      return files;
    };

    const changedFiles = await getChangedFiles();
    const hasLocalChanges = changedFiles.size > 0;
    if (hasLocalChanges) {
      this.log("Local files have changed since you last synced");
      this.logPaths("-", Array.from(changedFiles.keys()), [], { limit: changedFiles.size });
      this.log();
    }

    this.debug("init %O", { metadata: this.metadata, remoteFilesVersion, hasRemoteChanges, hasLocalChanges });

    let action: Action | undefined;
    if (hasLocalChanges) {
      ({ action } = await prompt({
        type: "list",
        name: "action",
        choices: [Action.CANCEL, Action.MERGE, Action.RESET],
        message: hasRemoteChanges ? "Remote files have also changed. How would you like to proceed?" : "How would you like to proceed?",
      }));
    }

    switch (action) {
      case Action.MERGE: {
        // get all the changed files again in case more changed
        const files = await getChangedFiles();

        // we purposefully don't set the returned remoteFilesVersion here because we haven't processed the in-between versions yet
        await this.client.queryUnwrap({
          query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
          variables: {
            input: {
              expectedRemoteFilesVersion: remoteFilesVersion,
              changed: await pMap(files, async ([filepath, stats]) => {
                if (stats.mtime.getTime() > this.metadata.mtime) {
                  this.metadata.mtime = stats.mtime.getTime();
                }

                return {
                  path: this.normalize(filepath),
                  mode: stats.mode,
                  content: await fs.readFile(filepath, "base64"),
                  encoding: FileSyncEncoding.Base64,
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
        this.metadata.filesVersion = "0";
        break;
      }
      case Action.CANCEL: {
        process.exit(0);
      }
    }

    this.debug("started");
  }

  async run(): Promise<void> {
    let error: unknown;

    this.stop = async (e?: unknown) => {
      if (this.status != SyncStatus.RUNNING) return;

      error = e;
      this.debug("stopping");
      this.status = SyncStatus.STOPPING;

      try {
        unsubscribe();
        this.watcher.removeAllListeners();
        this.publish.flush();
        await this.queue.onIdle();
      } finally {
        await fs.outputJSON(this.absolute(".gadget", "sync.json"), this.metadata, { spaces: 2 });
        await Promise.allSettled([this.watcher.close(), this.client.dispose()]);

        this.debug("stopped");
        this.status = SyncStatus.STOPPED;
      }
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        if (this.status != SyncStatus.RUNNING) return;

        this.log(chalk` Stopping... {gray (press Ctrl+C again to force)}`);
        void this.stop();

        // When ggt is run via npx, and the user presses Ctrl+C, npx sends SIGINT twice in quick succession. In order to prevent the second
        // SIGINT from triggering the force exit listener, we wait a bit before registering it. This is a bit of a hack, but it works.
        setTimeout(() => {
          process.once(signal, () => {
            this.log(" Exiting immediately. Note that files may not have finished syncing.");
            process.exit(1);
          });
        }, 100).unref();
      });
    }

    const unsubscribe = this.client.subscribeUnwrap(
      {
        query: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
        variables: () => ({ localFilesVersion: this.metadata.filesVersion }),
      },
      {
        error: (error) => void this.stop(error),
        next: ({ remoteFileSyncEvents: { remoteFilesVersion, changed, deleted } }) => {
          const remoteFiles = new Map(
            [...deleted, ...changed]
              .filter((event) => event.path.startsWith(".gadget/") || !this.ignorer.ignores(event.path))
              .map((e) => [e.path, e])
          );

          void this.queue
            .add(async () => {
              if (!remoteFiles.size) {
                if (BigInt(remoteFilesVersion) > BigInt(this.metadata.filesVersion)) {
                  // we still need to update filesVersion, otherwise our expectedFilesVersion will be behind the next time we publish
                  this.debug("updated local files version from %s to %s", this.metadata.filesVersion, remoteFilesVersion);
                  this.metadata.filesVersion = remoteFilesVersion;
                }
                return;
              }

              this.log(chalk`Received {gray ${format(new Date(), "pp")}}`);
              this.logPaths(
                "←",
                changed.map((x) => x.path).filter((x) => remoteFiles.has(x)),
                deleted.map((x) => x.path).filter((x) => remoteFiles.has(x))
              );

              await pMap(
                remoteFiles,
                async ([relativePath, file]) => {
                  const filepath = this.absolute(relativePath);
                  this.recentWrites.add(filepath);

                  if ("content" in file) {
                    await fs.ensureDir(path.dirname(filepath), { mode: 0o755 });
                    if (!file.path.endsWith("/")) {
                      await fs.writeFile(filepath, Buffer.from(file.content, file.encoding ?? FileSyncEncoding.Utf8), { mode: file.mode });
                    }
                    if (filepath == this.absolute("yarn.lock")) {
                      await execa("yarn", ["install"], { cwd: this.dir }).catch((err) => {
                        this.debug("yarn install failed");
                        this.debug(err.message);
                      });
                    }
                  } else {
                    await fs.remove(filepath);
                  }

                  if (filepath == this.ignorer.filepath) {
                    this.ignorer.reload();
                  }
                },
                { stopOnError: false }
              );

              this.debug("updated local files version from %s to %s", this.metadata.filesVersion, remoteFilesVersion);
              this.metadata.filesVersion = remoteFilesVersion;
            })
            .catch(this.stop);
        },
      }
    );

    const localFilesBuffer = new Map<string, { mode: number; mtime: number } | false>();

    this.publish = debounce(() => {
      const localFiles = new Map(localFilesBuffer.entries());
      localFilesBuffer.clear();

      void this.queue
        .add(async () => {
          const changed: FileSyncChangedEventInput[] = [];
          const deleted: FileSyncDeletedEventInput[] = [];

          await pMap(
            localFiles,
            async ([filepath, file]) => {
              if (file) {
                try {
                  changed.push({
                    path: this.normalize(filepath),
                    mode: file.mode,
                    content: await fs.readFile(filepath, "base64"),
                    encoding: FileSyncEncoding.Base64,
                  });
                } catch (error) {
                  // A file could have been changed and then deleted before we process the change event, so the readFile above will raise
                  // an ENOENT. This is normal operation, so just ignore this event.
                  ignoreEnoent(error);
                }
              } else {
                deleted.push({ path: this.normalize(filepath) });
              }
            },
            { stopOnError: false }
          );

          if (changed.length > 0 || deleted.length > 0) {
            const data = await this.client.queryUnwrap({
              query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
              variables: { input: { expectedRemoteFilesVersion: this.metadata.filesVersion, changed, deleted } },
            });

            this.log(chalk`Sent {gray ${format(new Date(), "pp")}}`);
            this.logPaths(
              "→",
              changed.map((x) => x.path),
              deleted.map((x) => x.path)
            );

            const { remoteFilesVersion } = data.publishFileSyncEvents;
            this.debug("remote files version after publishing %s", remoteFilesVersion);

            if (BigInt(remoteFilesVersion) > BigInt(this.metadata.filesVersion)) {
              this.debug("updated local files version from %s to %s", this.metadata.filesVersion, remoteFilesVersion);
              this.metadata.filesVersion = remoteFilesVersion;
            }
          }
        })
        .catch(this.stop);
    }, this.filePushDelay);

    this.watcher
      .add(`${this.dir}/**/*`)
      .on("error", (error) => void this.stop(error))
      .on("all", (event, filepath, stats) => {
        const relativePath = this.relative(filepath);

        if (event === "addDir" || event === "unlinkDir") {
          this.debug("skipping event caused by directory %s", relativePath);
          return;
        }

        if (stats?.isSymbolicLink?.()) {
          this.debug("skipping event caused by symlink %s", relativePath);
          return;
        }

        if (filepath == this.ignorer.filepath) {
          this.ignorer.reload();
        } else if (this.ignorer.ignores(filepath)) {
          this.debug("skipping event caused by ignored file %s", relativePath);
          return;
        }

        // we only update the mtime if the file is not ignored, because if we restart and the mtime is set to an ignored file, then it could
        // be greater than the mtime of all non ignored files and we'll think that local files have changed when only an ignored one has
        if (stats && stats.mtime.getTime() > this.metadata.mtime) {
          this.metadata.mtime = stats.mtime.getTime();
        }

        if (this.recentWrites.delete(filepath)) {
          this.debug("skipping event caused by recent write %s", relativePath);
          return;
        }

        this.debug("file changed %s", relativePath);

        switch (event) {
          case "add":
          case "change":
            assert(stats, "missing stats on add/change event");
            localFilesBuffer.set(filepath, { mode: stats.mode, mtime: stats.mtime.getTime() });
            break;
          case "unlink":
            localFilesBuffer.set(filepath, false);
            break;
        }

        this.publish();
      });

    this.status = SyncStatus.RUNNING;

    // app should be defined at this point
    assert(context.app);

    this.log();
    this.log(
      dedent(chalk`
      {bold ggt v${this.config.version}}

      App         ${context.app.name}
      Editor      https://${context.app.slug}.gadget.app/edit
      Playground  https://${context.app.slug}.gadget.app/api/graphql/playground
      Docs        https://docs.gadget.dev/api/${context.app.slug}

      {underline Endpoints} ${
        context.app.hasSplitEnvironments
          ? `
        - https://${context.app.slug}.gadget.app
        - https://${context.app.slug}--development.gadget.app`
          : `
        - https://${context.app.slug}.gadget.app`
      }

      Watching for file changes... {gray Press Ctrl+C to stop}
    `)
    );
    this.log();

    await sleepUntil(() => this.status == SyncStatus.STOPPED, { timeout: Infinity });

    if (error) {
      this.notify({ subtitle: "Uh oh!", message: "An error occurred while syncing files" });
      throw error;
    } else {
      this.log("Goodbye!");
    }
  }
}

export enum SyncStatus {
  STARTING,
  RUNNING,
  STOPPING,
  STOPPED,
}

export enum Action {
  CANCEL = "Cancel (Ctrl+C)",
  MERGE = "Merge local files with remote ones",
  RESET = "Reset local files to remote ones",
}

export const REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION: Query<
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables
> = /* GraphQL */ `
  subscription RemoteFileSyncEvents($localFilesVersion: String!) {
    remoteFileSyncEvents(localFilesVersion: $localFilesVersion, encoding: base64) {
      remoteFilesVersion
      changed {
        path
        mode
        content
        encoding
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
