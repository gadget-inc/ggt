import fs from "fs-extra";
import os from "node:os";
import pMap from "p-map";
import pTimeout from "p-timeout";
import type { Promisable } from "type-fest";
import { assert, expect, type Assertion } from "vitest";
import { z, type ZodSchema } from "zod";
import {
  FileSyncEncoding,
  type FileSyncChangedEventInput,
  type FileSyncDeletedEventInput,
  type MutationPublishFileSyncEventsArgs,
} from "../../src/__generated__/graphql.js";
import { args, type DevArgs } from "../../src/commands/dev.js";
import { getCurrentApp, getCurrentEnv } from "../../src/services/app/context.js";
import {
  FILE_SYNC_COMPARISON_HASHES_QUERY,
  FILE_SYNC_FILES_QUERY,
  FILE_SYNC_HASHES_QUERY,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../../src/services/app/edit/operation.js";
import type { Context } from "../../src/services/command/context.js";
import { Directory, swallowEnoent, type Hashes } from "../../src/services/filesync/directory.js";
import type { File } from "../../src/services/filesync/file.js";
import { FileSync } from "../../src/services/filesync/filesync.js";
import { isEqualHashes } from "../../src/services/filesync/hashes.js";
import { SyncJson, type SyncJsonArgs, type SyncJsonState } from "../../src/services/filesync/sync-json.js";
import { noop } from "../../src/services/util/function.js";
import { isNil } from "../../src/services/util/is.js";
import { defaults } from "../../src/services/util/object.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import type { PartialExcept } from "../../src/services/util/types.js";
import { testApp } from "./app.js";
import { makeContext } from "./context.js";
import { assertOrFail, log } from "./debug.js";
import { readDir, writeDir, type Files } from "./files.js";
import { makeMockEditSubscriptions, nockEditResponse, type MockEditSubscription } from "./graphql.js";
import { prettyJSON } from "./json.js";
import { mock, mockRestore } from "./mock.js";
import { testDirPath } from "./paths.js";
import { timeoutMs } from "./sleep.js";

export type FileSyncScenarioOptions<Args extends SyncJsonArgs = DevArgs> = {
  /**
   * The context to use for the {@linkcode SyncJson} instance.
   *
   * @default makeContext(args, ["dev", localDir.path, `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`])
   */
  ctx?: Context<Args>;

  /**
   * The files at filesVersion 1.
   *
   * @default { ".gadget/": "" }
   */
  filesVersion1Files: Files;

  /**
   * The files on the local filesystem.
   *
   * @default { ".gadget/": "" }
   */
  localFiles: Files;

  /**
   * The files Gadget currently has.
   *
   * @default { ".gadget/": "" }
   */
  gadgetFiles: Files;

  /**
   * A function to run before we update Gadget files from a
   * {@linkcode PUBLISH_FILE_SYNC_EVENTS_MUTATION}.
   */
  beforePublishFileSyncEvents?: () => Promisable<void>;

  /**
   * A function to run after we update Gadget files from a
   * {@linkcode PUBLISH_FILE_SYNC_EVENTS_MUTATION}.
   */
  afterPublishFileSyncEvents?: () => Promisable<void>;
};

export type SyncScenario<Args extends SyncJsonArgs = DevArgs> = {
  ctx: Context<Args>;

  /**
   * The {@linkcode SyncJson} instance the {@linkcode FileSync} instance
   * is using.
   */
  syncJson: SyncJson;

  /**
   * A FileSync instance that is initialized to the `localDir`.
   */
  filesync: FileSync;

  /**
   * A map of filesVersions to their respective {@linkcode Directory}.
   */
  filesVersionDirs: Map<bigint, Directory>;

  /**
   * A {@linkcode Directory} instance for the local directory.
   */
  localDir: Directory;

  /**
   * A {@linkcode Directory} instance for the gadget directory.
   */
  gadgetDir: Directory;

  /**
   * Waits until the local directory's filesVersion is the given filesVersion.
   */
  waitUntilLocalFilesVersion: (filesVersion: bigint) => Promise<void>;

  /**
   * Waits until the gadget directory's filesVersion is the given filesVersion.
   */
  waitUntilGadgetFilesVersion: (filesVersion: bigint) => Promise<void>;

  /**
   * Updates Gadget's files with the given changes.
   */
  changeGadgetFiles: (options: {
    /**
     * The files to change.
     */
    change: FileSyncChangedEventInput[];

    /**
     * The files to delete.
     */
    delete: FileSyncDeletedEventInput[];
  }) => Promise<void>;

  /**
   * Updates Gadget's files with the given changes and emits them to the
   * on going {@linkcode REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION}
   */
  emitGadgetChanges: (changes: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION["Data"]["remoteFileSyncEvents"]) => Promise<void>;

  /**
   * @returns A mock subscription for {@linkcode REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION}.
   */
  expectGadgetChangesSubscription: () => MockEditSubscription<REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION>;

  /**
   * @returns An assertion on an object with the following properties:
   * - `localDir`: The {@linkcode Files} in the local directory.
   * - `gadgetDir`: The {@linkcode Files} in the gadget directory.
   * - `filesVersionDirs`: A record where the keys are filesVersions and
   *   the values are the {@linkcode Files} for that filesVersion.
   */
  expectDirs: (expectedSyncJson?: Partial<SyncJsonState>) => Assertion<
    Promise<{
      localDir: Files;
      gadgetDir: Files;
      filesVersionDirs: Record<string, Files>;
    }>
  >;

  /**
   * Asserts that the local and gadget directories have the same hashes.
   */
  expectLocalAndGadgetHashesMatch: () => Promise<void>;
};

/**
 * Creates a filesync scenario for testing purposes.
 *
 * @see {@linkcode FileSyncScenarioOptions}
 * @see {@linkcode SyncScenario}
 */
export const makeSyncScenario = async <Args extends SyncJsonArgs = DevArgs>({
  ctx,
  filesVersion1Files,
  localFiles,
  gadgetFiles,
  beforePublishFileSyncEvents,
  afterPublishFileSyncEvents,
}: Partial<FileSyncScenarioOptions<Args>> = {}): Promise<SyncScenario<Args>> => {
  ctx ??= makeContext({
    parse: args,
    argv: ["dev", testDirPath("local"), `--app=${testApp.slug}`, `--env=${testApp.environments[0]!.name}`],
  }) as Context<Args>;

  let environmentFilesVersion = 1n;
  await writeDir(testDirPath("gadget"), { ".gadget/": "", ...gadgetFiles });
  const gadgetDir = await Directory.init(testDirPath("gadget"));

  await writeDir(testDirPath("fv-1"), { ".gadget/": "", ...filesVersion1Files });
  const filesVersion1Dir = await Directory.init(testDirPath("fv-1"));

  const filesVersionDirs = new Map<bigint, Directory>();
  filesVersionDirs.set(1n, filesVersion1Dir);

  if (!isEqualHashes(ctx, await gadgetDir.hashes(), await filesVersion1Dir.hashes())) {
    environmentFilesVersion = 2n;
    await fs.copy(gadgetDir.path, testDirPath("fv-2"));
    filesVersionDirs.set(2n, await Directory.init(testDirPath("fv-2")));
  }

  const localDir = await Directory.init(testDirPath("local"));
  if (localFiles) {
    await writeDir(testDirPath("local"), localFiles);
    await localDir.loadIgnoreFile();

    if (!localFiles[".gadget/sync.json"]) {
      const syncJsonFile: SyncJsonState = {
        application: testApp.slug,
        environment: "development",
        environments: { development: { filesVersion: "1" } },
      };

      await fs.outputJSON(
        localDir.absolute(".gadget/sync.json"),
        {
          ...syncJsonFile,

          // deprecated
          app: syncJsonFile.application,
          filesVersion: syncJsonFile.environments["development"]!.filesVersion,
        },
        { spaces: 2 },
      );
    }
  }

  mockRestore(SyncJson.load);
  const syncJson = await SyncJson.loadOrInit(ctx, { directory: localDir });
  mock(SyncJson, "load", () => syncJson);

  const filesync = new FileSync(syncJson);

  const changeGadgetFiles: SyncScenario["changeGadgetFiles"] = async (options) => {
    for (const file of options.delete) {
      if (file.path.endsWith("/")) {
        // replicate dl and only delete the dir if it's empty
        await fs.rmdir(gadgetDir.absolute(file.path)).catch(noop);
      } else {
        await fs.remove(gadgetDir.absolute(file.path));
      }
    }

    for (const file of options.change) {
      if (file.oldPath) {
        await fs.rename(gadgetDir.absolute(file.oldPath), gadgetDir.absolute(file.path));
      } else if (file.path.endsWith("/")) {
        await fs.ensureDir(gadgetDir.absolute(file.path));
      } else {
        await fs.outputFile(gadgetDir.absolute(file.path), file.content, { encoding: file.encoding });
      }

      await fs.chmod(gadgetDir.absolute(file.path), file.mode & 0o777);
    }

    environmentFilesVersion += 1n;
    const newFilesVersionDir = await Directory.init(testDirPath(`fv-${environmentFilesVersion}`));
    await fs.copy(gadgetDir.path, newFilesVersionDir.path);
    filesVersionDirs.set(environmentFilesVersion, newFilesVersionDir);
    log.trace("new files version", { environmentFilesVersion });
  };

  nockEditResponse({
    app: getCurrentApp(ctx),
    env: getCurrentEnv(ctx),
    optional: true,
    persist: true,
    operation: FILE_SYNC_HASHES_QUERY,
    expectVariables: z.object({ filesVersion: z.string().optional() }).optional(),
    response: async (variables) => {
      let filesVersion: bigint;
      let hashes: Hashes;

      if (isNil(variables?.filesVersion)) {
        log.trace("sending gadget hashes", { environmentFilesVersion, variables });
        filesVersion = environmentFilesVersion;
        hashes = await gadgetDir.hashes();
      } else {
        filesVersion = BigInt(variables.filesVersion);
        log.trace("sending files version hashes", { filesVersion, variables });
        const filesVersionDir = filesVersionDirs.get(filesVersion);
        assert(filesVersionDir, `filesVersionDir ${filesync.syncJson.filesVersion} doesn't exist`);
        hashes = await filesVersionDir.hashes();
      }

      return {
        data: {
          fileSyncHashes: {
            filesVersion: String(filesVersion),
            hashes,
          },
        },
      };
    },
  });

  nockEditResponse({
    app: getCurrentApp(ctx),
    env: getCurrentEnv(ctx),
    optional: true,
    persist: true,
    operation: FILE_SYNC_COMPARISON_HASHES_QUERY,
    expectVariables: z.object({ filesVersion: z.string() }),
    response: async (variables) => {
      log.trace("sending comparison hashes", { environmentFilesVersion, variables });

      const filesVersionDir = filesVersionDirs.get(BigInt(variables.filesVersion));
      assertOrFail(filesVersionDir, `filesVersionDir ${filesync.syncJson.filesVersion} doesn't exist`);

      const [localFilesVersionHashes, environmentHashes] = await Promise.all([filesVersionDir.hashes(), gadgetDir.hashes()]);

      return {
        data: {
          fileSyncComparisonHashes: {
            filesVersionHashes: {
              filesVersion: variables.filesVersion,
              hashes: localFilesVersionHashes,
            },
            latestFilesVersionHashes: {
              filesVersion: String(environmentFilesVersion),
              hashes: environmentHashes,
            },
          },
        },
      };
    },
  });

  nockEditResponse({
    app: getCurrentApp(ctx),
    env: getCurrentEnv(ctx),
    optional: true,
    persist: true,
    operation: FILE_SYNC_FILES_QUERY,
    expectVariables: z.object({
      filesVersion: z.string().optional(),
      paths: z.array(z.string()),
      encoding: z.nativeEnum(FileSyncEncoding).optional(),
    }),
    response: async ({ filesVersion, paths, encoding }) => {
      filesVersion ??= String(environmentFilesVersion);
      encoding ??= FileSyncEncoding.Base64;

      const filesVersionDir = filesVersionDirs.get(BigInt(filesVersion));
      assert(filesVersionDir, `filesVersionDir ${filesync.syncJson.filesVersion} doesn't exist`);

      return {
        data: {
          fileSyncFiles: {
            filesVersion,
            files: await pMap(paths, async (filepath) => {
              const stats = await fs.stat(filesVersionDir.absolute(filepath));
              let content = "";
              if (stats.isFile()) {
                content = await fs.readFile(filesVersionDir.absolute(filepath), { encoding });
              }

              return {
                path: filepath,
                mode: stats.mode,
                content,
                encoding: FileSyncEncoding.Base64,
              };
            }),
          },
        },
      };
    },
  });

  nockEditResponse({
    app: getCurrentApp(ctx),
    env: getCurrentEnv(ctx),
    optional: true,
    persist: true,
    operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
    expectVariables: z.object({
      input: z.object({
        expectedRemoteFilesVersion: z.string(),
        changed: z.array(
          z.object({
            path: z.string(),
            oldPath: z.string().optional(),
            mode: z.number(),
            content: z.string(),
            encoding: z.nativeEnum(FileSyncEncoding),
          }),
        ),
        deleted: z.array(z.object({ path: z.string() })),
      }),
    }),
    response: async ({ input: { expectedRemoteFilesVersion, changed, deleted } }) => {
      log.trace("mocking publish filesync events result", { expectedRemoteFilesVersion, changed, deleted });

      assert(expectedRemoteFilesVersion === String(environmentFilesVersion), "Files version mismatch");
      assert(
        changed.every((change) => deleted.every((del) => del.path !== change.path)),
        "changed and deleted files must not overlap",
      );

      await beforePublishFileSyncEvents?.();
      await changeGadgetFiles({ change: changed, delete: deleted });
      await afterPublishFileSyncEvents?.();

      return {
        data: {
          publishFileSyncEvents: {
            remoteFilesVersion: String(environmentFilesVersion),
            problems: [],
          },
        },
      };
    },
  });

  const mockEditSubscriptions = makeMockEditSubscriptions();

  return {
    ctx,
    syncJson,
    filesync,
    filesVersionDirs,
    localDir,
    gadgetDir,
    changeGadgetFiles,

    waitUntilLocalFilesVersion: async (filesVersion) => {
      log.trace("waiting for local files version", { filesVersion });
      const signal = new PromiseSignal();
      const localSyncJsonPath = localDir.absolute(".gadget/sync.json");

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      const interval = setInterval(async () => {
        try {
          log.trace("checking local files version", { filesVersion });
          const state = (await fs.readJSON(localSyncJsonPath)) as SyncJsonState;
          const environment = state.environments[state.environment];
          assertOrFail(environment, "environment must exist");

          if (BigInt(state.environments[state.environment]!.filesVersion) === filesVersion) {
            log.trace("signaling local files version", { filesVersion });
            signal.resolve();
            clearInterval(interval);
          }
        } catch (error) {
          swallowEnoent(error);
        }
      }, 100);

      await pTimeout(signal, {
        message: `Timed out waiting for gadget files version to become ${filesVersion}`,
        milliseconds: timeoutMs("5s"),
      });
    },

    waitUntilGadgetFilesVersion: async (filesVersion) => {
      log.trace("waiting for gadget files version", { filesVersion });
      const signal = new PromiseSignal();

      const interval = setInterval(() => {
        log.trace("checking gadget files version", { filesVersion });
        if (filesVersionDirs.has(filesVersion)) {
          log.trace("signaling gadget files version", { filesVersion });
          signal.resolve();
          clearInterval(interval);
        }
      }, 100);

      await pTimeout(signal, {
        message: `Timed out waiting for gadget files version to become ${filesVersion}`,
        milliseconds: timeoutMs("5s"),
      });
    },

    emitGadgetChanges: async (changes) => {
      expect(changes.remoteFilesVersion).toBe(String(environmentFilesVersion + 1n));
      await changeGadgetFiles({ change: changes.changed, delete: changes.deleted });
      await mockEditSubscriptions
        .expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)
        .emitResponse({ data: { remoteFileSyncEvents: changes } });
    },

    expectGadgetChangesSubscription: () => mockEditSubscriptions.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION),

    expectDirs: (expectedSyncJson) => {
      return expect(
        (async () => {
          const [local, gadget, filesVersions] = await Promise.all([
            readDir(localDir.path),
            readDir(gadgetDir.path),
            (async () => {
              const dirs = {} as Record<string, Files>;
              await pMap(filesVersionDirs, async ([filesVersion, dir]) => {
                dirs[String(filesVersion)] = await readDir(dir.path);
              });
              return dirs;
            })(),
          ]);

          const actualSyncJsonFile = local[".gadget/sync.json"];
          const expectedSyncJsonFile = expectSyncJson(filesync, expectedSyncJson);

          try {
            expect(actualSyncJsonFile).toEqual(expectedSyncJsonFile);
          } catch (error) {
            console.error("unexpected .gadget/sync.json", { expected: expectedSyncJsonFile, actual: actualSyncJsonFile });
            throw error;
          }

          // format .gadget/sync.json on a single line so inline snapshots are easier to read
          local[".gadget/sync.json"] = JSON.stringify(JSON.parse(local[".gadget/sync.json"]!));

          return {
            localDir: local,
            gadgetDir: gadget,
            filesVersionDirs: filesVersions,
          };
        })(),
      );
    },

    expectLocalAndGadgetHashesMatch: async () => {
      const localHashes = await localDir.hashes();
      const environmentHashes = await gadgetDir.hashes();
      expect(localHashes).toEqual(environmentHashes);
    },
  };
};

/**
 * Creates hashes of the given files.
 */
export const makeHashes = async ({
  filesVersionFiles,
  localFiles,
  gadgetFiles,
}: {
  filesVersionFiles: Files;
  localFiles: Files;
  gadgetFiles?: Files;
}): Promise<{ localFilesVersionHashes: Hashes; localHashes: Hashes; environmentHashes: Hashes }> => {
  const [localFilesVersionHashes, localHashes, environmentHashes] = await Promise.all([
    writeDir(testDirPath("filesVersion"), filesVersionFiles)
      .then(() => Directory.init(testDirPath("filesVersion")))
      .then((dir) => dir.hashes()),

    writeDir(testDirPath("local"), localFiles)
      .then(() => Directory.init(testDirPath("local")))
      .then((dir) => dir.hashes()),

    !gadgetFiles
      ? Promise.resolve({})
      : writeDir(testDirPath("gadget"), gadgetFiles)
          .then(() => Directory.init(testDirPath("gadget")))
          .then((dir) => dir.hashes()),
  ]);

  return { localFilesVersionHashes, localHashes, environmentHashes };
};

export const defaultFileMode = os.platform() === "win32" ? 0o100666 : 0o100644;
export const defaultDirMode = os.platform() === "win32" ? 0o40666 : 0o40755;

export const makeFile = (options: PartialExcept<File, "path">): File => {
  const f = defaults(options, {
    content: "",
    mode: options.path.endsWith("/") ? defaultDirMode : defaultFileMode,
    encoding: FileSyncEncoding.Base64,
  });

  f.content = Buffer.from(f.content).toString(f.encoding);

  return f;
};

export const expectSyncJson = (filesync: FileSync, expected: Partial<SyncJsonState> = {}): string => {
  expect(filesync.syncJson.state).toMatchObject(expected);
  return prettyJSON(filesync.syncJson.state);
};

export const expectPublishVariables = (expected: MutationPublishFileSyncEventsArgs): ZodSchema<MutationPublishFileSyncEventsArgs> => {
  return z
    .strictObject({
      input: z.strictObject({
        expectedRemoteFilesVersion: z.string(),
        changed: z.array(
          z.strictObject({
            path: z.string(),
            oldPath: z.string().optional(),
            mode: z.number(),
            content: z.string(),
            encoding: z.nativeEnum(FileSyncEncoding),
          }),
        ),
        deleted: z.array(z.strictObject({ path: z.string() })),
      }),
    })
    .refine((actual) => {
      // sort the events by path so that toEqual() doesn't complain about the order
      actual.input.changed = actual.input.changed.sort((a, b) => a.path.localeCompare(b.path));
      actual.input.deleted = actual.input.deleted.sort((a, b) => a.path.localeCompare(b.path));
      expected.input.changed = expected.input.changed.sort((a, b) => a.path.localeCompare(b.path));
      expected.input.deleted = expected.input.deleted.sort((a, b) => a.path.localeCompare(b.path));

      expect(actual).toEqual(expected);

      return actual;
    });
};
