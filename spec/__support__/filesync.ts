import fs from "fs-extra";
import assert from "node:assert";
import os from "node:os";
import pMap from "p-map";
import pTimeout from "p-timeout";
import { expect, vi, type Assertion } from "vitest";
import { z } from "zod";
import {
  FileSyncEncoding,
  type FileSyncChangedEvent,
  type FileSyncChangedEventInput,
  type FileSyncDeletedEventInput,
} from "../../src/__generated__/graphql.js";
import {
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILES_VERSION_QUERY,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../../src/services/app/edit-graphql.js";
import { Directory, swallowEnoent } from "../../src/services/filesync/directory.js";
import type { File } from "../../src/services/filesync/file.js";
import { FileSync } from "../../src/services/filesync/filesync.js";
import { noop } from "../../src/services/util/function.js";
import { defaults, omit } from "../../src/services/util/object.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import type { PartialExcept } from "../types.js";
import { testApp } from "./app.js";
import { log } from "./debug.js";
import { makeMockEditGraphQLSubscriptions, nockEditGraphQLResponse, type MockEditGraphQLSubscription } from "./edit-graphql.js";
import { readDir, writeDir, type Files } from "./files.js";
import { prettyJSON } from "./json.js";
import { testDirPath } from "./paths.js";
import { timeoutMs } from "./sleep.js";
import { testUser } from "./user.js";

/**
 * Represents the state of a FileSync instance.
 */
export type SyncJson = (typeof FileSync.prototype)["_state"];

/**
 * Represents the state of a FileSync instance, but with optional fields
 * and the filesVersion field as a string or bigint.
 */
export type PartialSyncJson = Partial<Omit<SyncJson, "filesVersion"> & { filesVersion?: string | bigint }>;

export type SyncScenarioOptions = {
  /**
   * The files at filesVersion 1.
   * @default { ".gadget/": "" }
   */
  filesVersion1Files: Files;

  /**
   * The files on the local filesystem.
   * @default { ".gadget/": "" }
   */
  localFiles: Files;

  /**
   * The filesVersion Gadget currently has.
   */
  gadgetFilesVersion?: 1n | 2n;

  /**
   * The files Gadget currently has.
   * @default { ".gadget/": "" }
   */
  gadgetFiles: Files;
};

export type SyncScenario = {
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
   * Updates Gadget's files with the given changes and emits them to the
   * on going {@linkcode REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION}
   */
  emitGadgetChanges: (changes: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION["Data"]["remoteFileSyncEvents"]) => Promise<void>;

  /**
   * @returns A mock subscription for {@linkcode REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION}.
   */
  expectGadgetChangesSubscription: () => MockEditGraphQLSubscription<REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION>;

  /**
   * @returns An assertion on an object with the following properties:
   * - `localDir`: The {@linkcode Files} in the local directory.
   * - `gadgetDir`: The {@linkcode Files} in the gadget directory.
   * - `filesVersionDirs`: A record where the keys are filesVersions and
   *   the values are the {@linkcode Files} for that filesVersion.
   */
  expectDirs: (expectedSyncJson?: PartialSyncJson) => Assertion<
    Promise<{
      localDir: Files;
      gadgetDir: Files;
      filesVersionDirs: Record<string, Files>;
    }>
  >;
};

/**
 * Creates a filesync scenario for testing purposes.
 *
 * @see {@linkcode SyncScenarioOptions}
 * @see {@linkcode SyncScenario}
 */
export const makeSyncScenario = async ({
  filesVersion1Files,
  localFiles,
  gadgetFilesVersion = 1n,
  gadgetFiles,
}: Partial<SyncScenarioOptions> = {}): Promise<SyncScenario> => {
  await writeDir(testDirPath("gadget"), { ".gadget/": "", ...gadgetFiles });
  const gadgetDir = await Directory.init(testDirPath("gadget"));

  await writeDir(testDirPath("fv-1"), { ".gadget/": "", ...filesVersion1Files });
  const filesVersion1Dir = await Directory.init(testDirPath("fv-1"));

  const filesVersionDirs = new Map<bigint, Directory>();
  filesVersionDirs.set(1n, filesVersion1Dir);

  if (gadgetFilesVersion === 2n) {
    await fs.copy(gadgetDir.path, testDirPath("fv-2"));
    filesVersionDirs.set(2n, await Directory.init(testDirPath("fv-2")));
  }

  const localDir = await Directory.init(testDirPath("local"));
  if (localFiles) {
    await writeDir(testDirPath("local"), localFiles);
    await localDir.loadIgnoreFile();

    const syncJson: SyncJson = { app: testApp.slug, filesVersion: "1", mtime: Date.now() + 1 };
    await fs.outputJSON(localDir.absolute(".gadget/sync.json"), syncJson, { spaces: 2 });
  }

  FileSync.init.mockRestore?.();
  const filesync = await FileSync.init({ user: testUser, dir: localDir.path, app: testApp.slug });
  vi.spyOn(FileSync, "init").mockResolvedValue(filesync);

  const processGadgetChanges = async ({
    changed,
    deleted,
  }: {
    changed: FileSyncChangedEventInput[];
    deleted: FileSyncDeletedEventInput[];
  }): Promise<void> => {
    for (const file of deleted) {
      if (file.path.endsWith("/")) {
        // replicate dl and only delete the dir if it's empty
        await fs.rmdir(gadgetDir.absolute(file.path)).catch(noop);
      } else {
        await fs.remove(gadgetDir.absolute(file.path));
      }
    }

    for (const file of changed) {
      if (file.oldPath) {
        await fs.rename(gadgetDir.absolute(file.oldPath), gadgetDir.absolute(file.path));
      } else if (file.path.endsWith("/")) {
        await fs.ensureDir(gadgetDir.absolute(file.path));
      } else {
        await fs.outputFile(gadgetDir.absolute(file.path), file.content, { encoding: file.encoding });
      }

      await fs.chmod(gadgetDir.absolute(file.path), file.mode & 0o777);
    }

    gadgetFilesVersion += 1n;
    const newFilesVersionDir = await Directory.init(testDirPath(`fv-${gadgetFilesVersion}`));
    await fs.copy(gadgetDir.path, newFilesVersionDir.path);
    filesVersionDirs.set(gadgetFilesVersion, newFilesVersionDir);
    log.trace("new files version", { gadgetFilesVersion });
  };

  void nockEditGraphQLResponse({
    optional: true,
    persist: true,
    query: REMOTE_FILES_VERSION_QUERY,
    result: () => {
      return {
        data: {
          remoteFilesVersion: String(gadgetFilesVersion),
        },
      };
    },
  });

  void nockEditGraphQLResponse({
    optional: true,
    persist: true,
    query: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
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
    result: async ({ input: { expectedRemoteFilesVersion, changed, deleted } }) => {
      log.trace("mocking publish filesync events result", { expectedRemoteFilesVersion, changed, deleted });

      assert(expectedRemoteFilesVersion === String(gadgetFilesVersion), "Files version mismatch");
      assert(
        changed.every((change) => deleted.every((del) => del.path !== change.path)),
        "changed and deleted files must not overlap",
      );

      await processGadgetChanges({ changed, deleted });

      return {
        data: {
          publishFileSyncEvents: {
            remoteFilesVersion: String(gadgetFilesVersion),
          },
        },
      };
    },
  });

  const mockEditGraphQLSubs = makeMockEditGraphQLSubscriptions();
  mockEditGraphQLSubs.mockInitialResult(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION, async ({ localFilesVersion }) => {
    log.trace("mocking initial result for remote file sync events", { localFilesVersion });

    const changed = [] as FileSyncChangedEvent[];
    if (localFilesVersion === "0") {
      const gadgetFiles = await readDir(gadgetDir.path);
      for (const [path, content] of Object.entries(gadgetFiles)) {
        changed.push({
          path,
          mode: path.endsWith("/") ? defaultDirMode : defaultFileMode,
          content: Buffer.from(content).toString(FileSyncEncoding.Base64),
          encoding: FileSyncEncoding.Base64,
        });
      }
    } else if (localFilesVersion !== String(gadgetFilesVersion)) {
      // tests should make local files start at version 0 (initial sync)
      // or the same version as gadget (no changes) because we don't
      // mimic sending file version diffs
      throw new Error(`Unexpected local files version: ${localFilesVersion}, expected ${gadgetFilesVersion}`);
    }

    return {
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: String(gadgetFilesVersion),
          changed,
          deleted: [],
        },
      },
    };
  });

  return {
    filesync,
    filesVersionDirs,
    localDir,
    gadgetDir,

    waitUntilLocalFilesVersion: async (filesVersion) => {
      log.trace("waiting for local files version", { filesVersion });
      const signal = new PromiseSignal();
      const localSyncJsonPath = localDir.absolute(".gadget/sync.json");

      const interval = setInterval(() => void signalIfFilesVersion(), 100);

      const signalIfFilesVersion = async (): Promise<void> => {
        try {
          log.trace("checking local files version", { filesVersion });
          const syncJson = await fs.readJSON(localSyncJsonPath);
          if (BigInt(syncJson.filesVersion) === filesVersion) {
            log.trace("signaling local files version", { filesVersion });
            signal.resolve();
            clearInterval(interval);
          }
        } catch (error) {
          swallowEnoent(error);
        }
      };

      await pTimeout(signal, {
        message: `Timed out waiting for gadget files version to become ${filesVersion}`,
        milliseconds: timeoutMs("5s"),
      });
    },

    waitUntilGadgetFilesVersion: async (filesVersion) => {
      log.trace("waiting for gadget files version", { filesVersion });
      const signal = new PromiseSignal();

      const interval = setInterval(() => signalIfFilesVersion(), 100);

      const signalIfFilesVersion = (): void => {
        log.trace("checking gadget files version", { filesVersion });
        if (filesVersionDirs.has(filesVersion)) {
          log.trace("signaling gadget files version", { filesVersion });
          signal.resolve();
          clearInterval(interval);
        }
      };

      await pTimeout(signal, {
        message: `Timed out waiting for gadget files version to become ${filesVersion}`,
        milliseconds: timeoutMs("5s"),
      });
    },

    emitGadgetChanges: async (changes) => {
      expect(changes.remoteFilesVersion).toBe(String(gadgetFilesVersion + 1n));
      await processGadgetChanges(changes);
      mockEditGraphQLSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).emitResult({ data: { remoteFileSyncEvents: changes } });
    },

    expectGadgetChangesSubscription: () => mockEditGraphQLSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION),

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

          expect(local[".gadget/sync.json"]).toEqual(expectSyncJson(filesync, expectedSyncJson));

          // omit mtime from the snapshot
          const withoutMtime = omit(JSON.parse(local[".gadget/sync.json"]!), ["mtime"]);
          local[".gadget/sync.json"] = JSON.stringify(withoutMtime);

          return {
            localDir: local,
            gadgetDir: gadget,
            filesVersionDirs: filesVersions,
          };
        })(),
      );
    },
  };
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

export const expectSyncJson = (filesync: FileSync, expected: PartialSyncJson = {}): string => {
  // @ts-expect-error _state is private
  const state = filesync._state;
  expect(state).toMatchObject(expected);
  return prettyJSON(state);
};
