import fs from "fs-extra";
import assert from "node:assert";
import os from "node:os";
import { expect, vi, type Assertion } from "vitest";
import { z } from "zod";
import {
  FileSyncEncoding,
  type FileSyncChangedEventInput,
  type FileSyncDeletedEventInput,
  type MutationPublishFileSyncEventsArgs,
} from "../../src/__generated__/graphql.js";
import {
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILES_VERSION_QUERY,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../../src/services/app/edit-graphql.js";
import { Directory } from "../../src/services/filesync/directory.js";
import { FileSync, isEmptyOrNonExistentDir, type File } from "../../src/services/filesync/filesync.js";
import { isNil } from "../../src/services/util/is.js";
import { defaults, omit } from "../../src/services/util/object.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import type { PartialExcept } from "../types.js";
import { testApp } from "./app.js";
import { log } from "./debug.js";
import { makeMockEditGraphQL, nockEditGraphQLResponse, type MockSubscription } from "./edit-graphql.js";
import { readDir, writeDir, type Files } from "./files.js";
import { prettyJSON } from "./json.js";
import { testDirPath } from "./paths.js";
import { testUser } from "./user.js";

export const defaultFileMode = os.platform() === "win32" ? 0o100666 : 0o100644;
export const defaultDirMode = os.platform() === "win32" ? 0o40666 : 0o40755;

export const makeFile = (options: PartialExcept<File, "path">): File => {
  const f = defaults(options, {
    content: "",
    mode: defaultFileMode,
    encoding: FileSyncEncoding.Base64,
  });

  f.content = Buffer.from(f.content).toString(f.encoding);

  return f;
};

export const makeDir = (options: PartialExcept<File, "path">): File => {
  assert(options.path.endsWith("/"));
  return makeFile({ content: "", mode: defaultDirMode, ...options });
};

export const expectPublishVariables = (
  expected: MutationPublishFileSyncEventsArgs,
): ((actual: MutationPublishFileSyncEventsArgs) => void) => {
  return (actual) => {
    assert(!isNil(actual));

    // sort the events by path so that toEqual() doesn't complain about the order
    actual.input.changed = actual.input.changed.sort((a, b) => a.path.localeCompare(b.path));
    actual.input.deleted = actual.input.deleted.sort((a, b) => a.path.localeCompare(b.path));
    expected.input.changed = expected.input.changed.sort((a, b) => a.path.localeCompare(b.path));
    expected.input.deleted = expected.input.deleted.sort((a, b) => a.path.localeCompare(b.path));

    expect(actual).toEqual(expected);
  };
};

export type SyncJson = (typeof FileSync.prototype)["_state"];

export type PartialSyncJson = Partial<Omit<SyncJson, "filesVersion"> & { filesVersion?: string | bigint }>;

export const expectSyncJson = (filesync: FileSync, expected: PartialSyncJson = {}): string => {
  // @ts-expect-error _state is private
  const state = filesync._state;
  expect(state).toMatchObject(expected);
  return prettyJSON(state);
};

export const makeSyncJson = ({ app = testApp.slug, filesVersion = 1n, mtime = Date.now() }: PartialSyncJson = {}): string => {
  return prettyJSON({ app, filesVersion: String(filesVersion), mtime });
};

export type SyncScenarioOptions = {
  gadgetFilesVersion: bigint;
  gadgetFiles: Record<string, string>;
  localFiles: Record<string, string>;
  filesVersion1Files: Record<string, string>;
};

export type SyncScenario = {
  filesync: FileSync;
  expectGadgetChangesSubscription: () => MockSubscription<REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION>;
  emitGadgetChanges: (result: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION["Data"]["remoteFileSyncEvents"]) => Promise<void>;

  localDir: Directory;
  expectLocalDir: () => Assertion<Promise<Files>>;
  waitUntilLocalFilesVersion: (filesVersion: bigint) => PromiseSignal;

  gadgetDir: Directory;
  expectGadgetDir: () => Assertion<Promise<Files>>;
  waitUntilGadgetFilesVersion: (filesVersion: bigint) => PromiseSignal;

  filesVersionDirs: Map<bigint, Directory>;
  expectFilesVersionDirs: () => Assertion<Promise<Record<string, Files>>>;
};

export const makeSyncScenario = async ({
  filesVersion1Files,
  localFiles,
  gadgetFiles,
  gadgetFilesVersion = 1n,
}: Partial<SyncScenarioOptions> = {}): Promise<SyncScenario> => {
  await writeDir(testDirPath("local"), { ".gadget/sync.json": makeSyncJson(), ...localFiles });
  const localDir = await Directory.init(testDirPath("local"));

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

  FileSync.init.mockRestore?.();
  const filesync = await FileSync.init({ user: testUser, dir: localDir.path });
  // save to update the mtime and not require a sync
  // @ts-expect-error _save is private
  await filesync._save(filesync.filesVersion);
  vi.spyOn(FileSync, "init").mockResolvedValue(filesync);

  void nockEditGraphQLResponse({
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

  const mockEditGraphQL = makeMockEditGraphQL();

  return {
    filesync,
    expectGadgetChangesSubscription: () => mockEditGraphQL.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION),
    emitGadgetChanges: async (changes) => {
      await processGadgetChanges(changes);
      mockEditGraphQL.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).emitResult({ data: { remoteFileSyncEvents: changes } });
    },

    localDir,
    expectLocalDir: (expectedSyncJson?: PartialSyncJson) =>
      expect(
        (async () => {
          const dir = await readDir(localDir.path);
          expect(dir[".gadget/sync.json"]).toEqual(expectSyncJson(filesync, expectedSyncJson));
          // omit mtime from the snapshot
          dir[".gadget/sync.json"] = JSON.stringify(omit(JSON.parse(dir[".gadget/sync.json"]!), ["mtime"]));
          return dir;
        })(),
      ),
    waitUntilLocalFilesVersion: (filesVersion) => {
      log.trace("waiting for local files version", { filesVersion });
      const signal = new PromiseSignal();
      const localSyncJsonPath = localDir.absolute(".gadget/sync.json");

      const signalIfFilesVersion = async (): Promise<void> => {
        const syncJson = await fs.readJSON(localSyncJsonPath);
        if (BigInt(syncJson.filesVersion) === filesVersion) {
          log.trace("signaling local files version", { filesVersion });
          signal.resolve();
        }
      };

      fs.watch(localSyncJsonPath, () => void signalIfFilesVersion());

      return signal;
    },

    gadgetDir,
    expectGadgetDir: () => expect(readDir(gadgetDir.path)),
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

    filesVersionDirs,
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
  };
};
