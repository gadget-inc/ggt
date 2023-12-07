import fs from "fs-extra";
import assert from "node:assert";
import os from "node:os";
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
import { FileSync, isEmptyOrNonExistentDir, type File } from "../../src/services/filesync/filesync.js";
import { defaults, omit } from "../../src/services/util/object.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import type { PartialExcept } from "../types.js";
import { testApp } from "./app.js";
import { log } from "./debug.js";
import { makeMockEditGraphQLSubscriptions, nockEditGraphQLResponse, type MockEditGraphQLSubscription } from "./edit-graphql.js";
import { readDir, writeDir, type Files } from "./files.js";
import { prettyJSON } from "./json.js";
import { testDirPath } from "./paths.js";
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
   * The .gadget/sync.json file on the local filesystem.
   * @default { app: testApp.slug, filesVersion: "1", mtime: Date.now() }
   */
  syncJson: PartialSyncJson;

  /**
   * The files on the local filesystem.
   * @default { ".gadget/": "" }
   */
  localFiles: Files;

  /**
   * The filesVersion of the files Gadget currently has.
   * @default 1n
   */
  gadgetFilesVersion: bigint;

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
   * @returns An assertion on a record where the keys are filesVersions
   * and the values are the {@linkcode Files} for that filesVersion.
   */
  expectFilesVersionDirs: () => Assertion<Promise<Record<string, Files>>>;

  /**
   * @param expectedSyncJson The expected {@linkcode SyncJson} in the local directory.
   * @returns An assertion on the {@linkcode Files} in the local directory.
   */
  expectLocalDir: (expectedSyncJson?: PartialSyncJson) => Assertion<Promise<Files>>;

  /**
   * @returns An assertion on the {@linkcode Files} in the gadget directory.
   */
  expectGadgetDir: () => Assertion<Promise<Files>>;

  /**
   * Waits until the local directory's filesVersion is the given filesVersion.
   */
  waitUntilLocalFilesVersion: (filesVersion: bigint) => PromiseSignal;

  /**
   * Waits until the gadget directory's filesVersion is the given filesVersion.
   */
  waitUntilGadgetFilesVersion: (filesVersion: bigint) => PromiseSignal;

  /**
   * Updates Gadget's files with the given changes and emits them to the
   * on going {@linkcode REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION}
   */
  emitGadgetChanges: (changes: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION["Data"]["remoteFileSyncEvents"]) => Promise<void>;

  /**
   * @returns A mock subscription for {@linkcode REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION}.
   */
  expectGadgetChangesSubscription: () => MockEditGraphQLSubscription<REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION>;
};

/**
 * Creates a filesync scenario for testing purposes.
 *
 * @see {@linkcode SyncScenarioOptions}
 * @see {@linkcode SyncScenario}
 */
export const makeSyncScenario = async ({
  filesVersion1Files,
  syncJson,
  localFiles,
  gadgetFiles,
  gadgetFilesVersion = 1n,
}: Partial<SyncScenarioOptions> = {}): Promise<SyncScenario> => {
  await writeDir(testDirPath("fv-1"), { ".gadget/": "", ...filesVersion1Files });
  const filesVersion1Dir = await Directory.init(testDirPath("fv-1"));

  const filesVersionDirs = new Map<bigint, Directory>();
  filesVersionDirs.set(1n, filesVersion1Dir);

  await writeDir(testDirPath("gadget"), { ".gadget/": "", ...gadgetFiles });
  const gadgetDir = await Directory.init(testDirPath("gadget"));

  if (gadgetFilesVersion === 2n) {
    await fs.copy(gadgetDir.path, testDirPath("fv-2"));
    filesVersionDirs.set(2n, await Directory.init(testDirPath("fv-2")));
  }

  if (localFiles) {
    await writeDir(testDirPath("local"), localFiles);
    await fs.outputFile(testDirPath("local/.gadget/sync.json"), makeSyncJson(syncJson));
  }
  const localDir = await Directory.init(testDirPath("local"));

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
        if (await isEmptyOrNonExistentDir(gadgetDir.absolute(file.path))) {
          await fs.remove(gadgetDir.absolute(file.path));
        }
      } else {
        await fs.remove(gadgetDir.absolute(file.path));
      }
    }

    for (const file of changed) {
      if (file.oldPath) {
        await fs.move(gadgetDir.absolute(file.oldPath), gadgetDir.absolute(file.path));
      } else if (file.path.endsWith("/")) {
        await fs.ensureDir(gadgetDir.absolute(file.path));
      } else {
        await fs.writeFile(gadgetDir.absolute(file.path), file.content, { encoding: file.encoding });
      }

      await fs.chmod(gadgetDir.absolute(file.path), file.mode & 0o777);
    }

    gadgetFilesVersion += 1n;

    const newFilesVersionDir = await Directory.init(testDirPath(`fv-${gadgetFilesVersion}`));
    await fs.copy(gadgetDir.path, newFilesVersionDir.path);
    filesVersionDirs.set(gadgetFilesVersion, newFilesVersionDir);
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

    expectFilesVersionDirs: () =>
      expect(
        (async () => {
          const dirs = {} as Record<string, Files>;
          for (const [filesVersion, dir] of filesVersionDirs) {
            dirs[String(filesVersion)] = await readDir(dir.path);
          }
          return dirs;
        })(),
      ),

    expectLocalDir: (expectedSyncJson) =>
      expect(
        (async () => {
          const dir = await readDir(localDir.path);
          expect(dir[".gadget/sync.json"]).toEqual(expectSyncJson(filesync, expectedSyncJson));
          // omit mtime from the snapshot
          dir[".gadget/sync.json"] = JSON.stringify(omit(JSON.parse(dir[".gadget/sync.json"]!), ["mtime"]));
          return dir;
        })(),
      ),

    expectGadgetDir: () => expect(readDir(gadgetDir.path)),

    waitUntilLocalFilesVersion: (filesVersion) => {
      log.trace("waiting for local files version", { filesVersion });
      const signal = new PromiseSignal();
      const localSyncJsonPath = localDir.absolute(".gadget/sync.json");

      const interval = setInterval(() => void signalIfFilesVersion(), 100);

      const signalIfFilesVersion = async (): Promise<void> => {
        try {
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

      return signal;
    },

    waitUntilGadgetFilesVersion: (filesVersion) => {
      log.trace("waiting for gadget files version", { filesVersion });
      const signal = new PromiseSignal();

      const interval = setInterval(() => signalIfFilesVersion(), 100);

      const signalIfFilesVersion = (): void => {
        if (filesVersionDirs.has(filesVersion)) {
          log.trace("signaling gadget files version", { filesVersion });
          signal.resolve();
          clearInterval(interval);
        }
      };

      return signal;
    },

    emitGadgetChanges: async (changes) => {
      await processGadgetChanges(changes);
      mockEditGraphQLSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).emitResult({ data: { remoteFileSyncEvents: changes } });
    },

    expectGadgetChangesSubscription: () => mockEditGraphQLSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION),
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

export const makeSyncJson = ({ app = testApp.slug, filesVersion = 1n, mtime = Date.now() }: PartialSyncJson = {}): string => {
  return prettyJSON({ app, filesVersion: String(filesVersion), mtime });
};
