import { default as FSWatcher } from "watcher";
import { execa } from "execa";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import { GraphQLError } from "graphql";
import inquirer from "inquirer";
import _ from "lodash";
import notifier from "node-notifier";
import path from "path";
import which from "which";
import Sync, {
  Action,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILES_VERSION_QUERY,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
  SyncState,
  SyncStatus,
} from "../../src/commands/sync.js";
import { context } from "../../src/utils/context.js";
import { ClientError, FlagError, InvalidSyncFileError, YarnNotFoundError } from "../../src/utils/errors.js";
import { sleep, sleepUntil } from "../../src/utils/sleep.js";
import { FileSyncEncoding } from "../../src/__generated__/graphql.js";
import { testDirPath } from "../vitest.setup.js";
import type { MockClient } from "../util.js";
import { expectDir, expectDirSync, getError, mockClient, setupDir } from "../util.js";
import type { SpyInstance } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const stats = { mode: 420, mtime: new Date("2000-01-01T01:00:00Z") };

it.todo("publishing does not send file changes if you delete more than N files at once");

describe("Sync", () => {
  let client: MockClient;
  let dir: string;
  let app: string;
  let sync: Sync;
  let oldFileStats: (filepath: string) => Stats;

  const emit: {
    all: (
      eventName: "add" | "addDir" | "change" | "unlink" | "unlinkDir" | "rename" | "renameDir",
      path: string,
      renamedPath?: string
    ) => void;
    error: (error: unknown) => void;
    close: () => void;
  } = {
    all: undefined as any,
    error: undefined as any,
    close: undefined as any,
  };

  beforeEach(() => {
    oldFileStats = Sync.fileStats;
    Sync.fileStats = vi.fn().mockImplementation(() => stats) as (filepath: string) => Stats;
    client = mockClient();
    dir = path.join(testDirPath(), "app");
    app = "test";
    sync = new Sync(["--app", app, "--file-push-delay", "10", dir], context.config);

    vi.spyOn(context, "getUser").mockResolvedValue({ id: 1, name: "Jane Doe", email: "jane@example.come" });
    vi.spyOn(context, "getAvailableApps").mockResolvedValue([
      { id: "1", slug: "test", primaryDomain: "test.gadget.app", hasSplitEnvironments: true },
      { id: "2", slug: "not-test", primaryDomain: "not-test.gadget.app", hasSplitEnvironments: false },
    ]);

    // TODO: we don't need to mock the watcher anymore since we're using the real filesystem
    vi.spyOn(FSWatcher.prototype, "close").mockImplementation(_.noop as any);
    vi.spyOn(Sync.prototype, "on").mockImplementation(function (this: Sync, eventName, handler) {
      switch (eventName) {
        case "all":
          emit.all = handler;
          break;
        case "error":
          emit.error = handler;
          break;
      }
      return this;
    });
  });

  afterEach(() => {
    Sync.fileStats = oldFileStats;
  });

  it("requires a user to be logged in", () => {
    expect(sync.requireUser).toBe(true);
  });

  describe("init", () => {
    it("throws YarnNotFoundError if yarn is not found", async () => {
      which.sync.mockReturnValue(null);

      await expect(sync.init()).rejects.toThrow(YarnNotFoundError);
    });

    it("does not throw YarnNotFoundError if yarn is found", async () => {
      which.sync.mockReturnValue("/path/to/yarn");

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await expect(init).resolves.toBeUndefined();
    });

    it("ensures `dir` exists", async () => {
      expect(fs.existsSync(dir)).toBe(false);

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;
      expect(fs.existsSync(dir)).toBe(true);
    });

    it("loads state from .gadget/sync.json", async () => {
      const state = SyncState.create(dir, { app, filesVersion: "77", mtime: 1658153625236 });

      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      expect(sync.state).toEqual(state);
    });

    it("uses default state if .gadget/sync.json does not exist and `dir` is empty", async () => {
      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      expect(sync.state).toEqual({ _rootDir: dir, _inner: { app: "test", filesVersion: "0", mtime: 0 } });
    });

    it("throws InvalidSyncFileError if .gadget/sync.json does not exist and `dir` is not empty", async () => {
      await setupDir(dir, {
        "foo.js": "foo",
      });

      await expect(sync.init()).rejects.toThrow(InvalidSyncFileError);
    });

    it("throws InvalidSyncFileError if .gadget/sync.json is invalid and `dir` is not empty", async () => {
      await setupDir(dir, {
        // has trailing comma
        ".gadget/sync.json": '{"app":"test","filesVersion":"77","mtime":1658153625236,}',
      });

      await expect(sync.init()).rejects.toThrow(InvalidSyncFileError);
    });

    it("does not throw InvalidSyncFileError if .gadget/sync.json is invalid, `dir` is not empty, and `--force` is passed", async () => {
      await setupDir(dir, {
        // has trailing comma
        ".gadget/sync.json": '{"app":"test","filesVersion":"77","mtime":1658153625236,}',
      });

      sync.argv.push("--force");
      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await expect(init).resolves.toBeUndefined();
    });

    it("throws FlagError if the `--app` flag is passed a different app name than the one in .gadget/sync.json", async () => {
      await setupDir(dir, {
        ".gadget/sync.json": prettyJson({ app: "not-test", filesVersion: "77", mtime: 1658153625236 }),
      });

      const error = await getError(() => sync.init());

      expect(error).toBeInstanceOf(FlagError);
      expect(error.description).toMatch(/^You were about to sync the following app to the following directory:/);
    });

    it("does not throw FlagError if the `--app` flag is passed a different app name than the one in .gadget/sync.json and `--force` is passed", async () => {
      await setupDir(dir, {
        ".gadget/sync.json": prettyJson({ app: "not-test", filesVersion: "77", mtime: 1658153625236 }),
      });

      sync.argv.push("--force");
      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await expect(init).resolves.toBeUndefined();
    });

    it("asks how to proceed if both local and remote files changed", async () => {
      await setupDir(dir, {
        ".gadget/sync.json": prettyJson({ app: "test", filesVersion: "1", mtime: Date.now() - 1000 }),
        "foo.js": "foo",
        "bar.js": "bar",
      });

      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "2" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await sleepUntil(() => inquirer.prompt.mock.calls.length > 0);
      expect(inquirer.prompt.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        {
          "choices": [
            "Cancel (Ctrl+C)",
            "Merge local files with remote ones",
            "Reset local files to remote ones",
          ],
          "message": "Remote files have also changed. How would you like to proceed?",
          "name": "action",
          "type": "list",
        }
      `);
    });

    it("asks how to proceed if only local files changed", async () => {
      await setupDir(dir, {
        ".gadget/sync.json": prettyJson({ app: "test", filesVersion: "1", mtime: Date.now() - 1000 }),
        "foo.js": "foo",
      });

      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await sleepUntil(() => inquirer.prompt.mock.calls.length > 0);
      expect(inquirer.prompt.mock.lastCall?.[0]).toMatchInlineSnapshot(`
        {
          "choices": [
            "Cancel (Ctrl+C)",
            "Merge local files with remote ones",
            "Reset local files to remote ones",
          ],
          "message": "How would you like to proceed?",
          "name": "action",
          "type": "list",
        }
      `);
    });

    it("does not ask how to proceed if only ignored files changed", async () => {
      await setupDir(dir, {
        ".ignore": "bar.js",
        "foo.js": "foo",
      });

      const stat = await fs.stat(path.join(dir, "foo.js"));
      await fs.outputJson(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      // wait a bit so the mtime is different
      await sleep(10);

      // write an ignored file
      await fs.writeFile(path.join(dir, "bar.js"), "bar");

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it("does not ask how to proceed if only remote files changed", async () => {
      await setupDir(dir, {
        "foo.js": "foo",
      });

      const stat = await fs.stat(path.join(dir, "foo.js"));
      await fs.outputJSON(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "2" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it("does not ask how to proceed if neither local nor remote files changed", async () => {
      await setupDir(dir, {
        "foo.js": "foo",
      });

      const stat = await fs.stat(path.join(dir, "foo.js"));
      await fs.outputJson(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it("publishes changed events when told to merge", async () => {
      inquirer.prompt.mockResolvedValue({ action: Action.MERGE });

      await setupDir(dir, {
        "foo.js": "foo",
        "bar.js": "bar",
      });

      const stat = await fs.stat(path.join(dir, "bar.js"));
      await fs.outputJSON(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      // wait a bit so the mtime is different
      await sleep(10);

      // modify a file
      await fs.writeFile(path.join(dir, "bar.js"), "bar2", "utf-8");

      // add a new file
      await fs.writeFile(path.join(dir, "baz.js"), "baz", "utf-8");

      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

      // foo.js didn't change, so it should not be included
      expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
        input: {
          expectedRemoteFilesVersion: String(sync.state.filesVersion),
          changed: expect.arrayContaining([
            { path: "bar.js", content: toBase64("bar2"), mode: expect.any(Number), encoding: FileSyncEncoding.Base64 },
            { path: "baz.js", content: toBase64("baz"), mode: expect.any(Number), encoding: FileSyncEncoding.Base64 },
          ]),
          deleted: [],
        },
      });
    });

    it("deletes local file changes and sets `state.filesVersion` to 0 when told to reset", async () => {
      inquirer.prompt.mockResolvedValue({ action: Action.RESET });

      await setupDir(dir, {
        "foo.js": "foo",
        "bar.js": "bar",
      });

      const stat = await fs.stat(path.join(dir, "bar.js"));
      await fs.outputJSON(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      // wait a bit so the mtime is different
      await sleep(10);

      // modify a file
      await fs.writeFile(path.join(dir, "bar.js"), "bar2", "utf-8");

      // add a new file
      await fs.writeFile(path.join(dir, "baz.js"), "baz", "utf-8");

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;

      // foo.js didn't change, so it should still exist
      await expectDir(dir, {
        ".gadget/sync.json": stateFile(sync),
        ".gadget/backup/bar.js": "bar2",
        ".gadget/backup/baz.js": "baz",
        "foo.js": "foo",
      });

      expect(sync.state.filesVersion).toBe(0n);
    });
  });

  describe("run", () => {
    let run: Promise<void>;
    let publish: SpyInstance;

    beforeEach(async () => {
      vi.spyOn(process, "on").mockImplementation(_.noop as any);

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;

      run = sync.run();

      publish = vi.spyOn(sync, "publish");
      vi.spyOn(sync, "stop");
    });

    afterEach(async () => {
      // restore so this.publish.flush() doesn't throw
      publish.mockRestore();
      await sync.stop();
      await run;
    });

    it.each(["SIGINT", "SIGTERM"])("stops on %s", (signal) => {
      const [, stop] = process.on.mock.calls.find(([name]) => name === signal) ?? [];
      expect(stop).toBeTruthy();
      expect(sync.status).toBe(SyncStatus.RUNNING);

      // restore so this.publish?.flush() doesn't throw
      sync.publish.mockRestore();
      stop();

      expect(sync.stop).toHaveBeenCalled();
      expect(sync.status).toBe(SyncStatus.STOPPING);
    });

    describe("writing", () => {
      it("writes changed files", async () => {
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [
                { path: "file.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 },
                { path: "some/deeply/nested/file.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
              ],
              deleted: [],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion === 1n);

        await expectDir(dir, {
          ".gadget/sync.json": stateFile(sync),
          "file.js": "foo",
          "some/deeply/nested/file.js": "bar",
        });
      });

      it("writes empty directories", async () => {
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [{ path: "dir/", content: toBase64(""), mode: 493, encoding: FileSyncEncoding.Base64 }],
              deleted: [],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        await expectDir(dir, {
          ".gadget/sync.json": stateFile(sync),
          "dir/": "",
        });
      });

      it("deletes deleted files", async () => {
        await setupDir(dir, {
          "file.js": "foo",
          "some/deeply/nested/file.js": "bar",
        });

        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [],
              deleted: [{ path: "file.js" }, { path: "some/deeply/nested/file.js" }],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        await expectDir(dir, {
          ".gadget/sync.json": stateFile(sync),
          ".gadget/backup/file.js": "foo",
          ".gadget/backup/some/deeply/nested/file.js": "bar",
          "some/deeply/nested/": "",
        });
      });

      it("updates `state.filesVersion` even if nothing changed", async () => {
        expect(sync.state.filesVersion).toBe(0n);

        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [],
              deleted: [],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        expect(sync.state.filesVersion).toBe(1n);
      });

      it("adds changed and deleted files to recentWrites", async () => {
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [{ path: "foo.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 }],
              deleted: [{ path: "bar.js" }],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        expect(sync.recentRemoteChanges.has("foo.js")).toBe(true);
        expect(sync.recentRemoteChanges.has("bar.js")).toBe(true);
      });

      it("does not write multiple batches of events at the same time", async () => {
        // emit the first batch of events
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [{ path: "foo.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 }],
              deleted: [],
            },
          },
        });

        // the first batch should be in progress
        expect(sync.queue.size).toBe(0);
        expect(sync.queue.pending).toBe(1);

        // emit another batch of events while the first batch is in progress
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "2",
              changed: [
                { path: "bar.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
                { path: "baz.js", content: toBase64("baz"), mode: 420, encoding: FileSyncEncoding.Base64 },
              ],
              deleted: [],
            },
          },
        });

        // the second batch should be queued
        expect(sync.queue.size).toBe(1);

        // the first batch should still be in progress
        expect(sync.queue.pending).toBe(1);

        // wait for the first batch to complete
        await sleepUntil(() => sync.queue.size == 0);

        // the first batch should be complete
        expectDirSync(dir, {
          ".gadget/sync.json": stateFile(sync),
          "foo.js": "foo",
        });

        // the second batch should now be in progress
        expect(sync.queue.size).toBe(0);
        expect(sync.queue.pending).toBe(1);

        // wait for the second batch to complete
        await sleepUntil(() => sync.state.filesVersion == 2n);

        // the second batch should be complete
        await expectDir(dir, {
          ".gadget/sync.json": stateFile(sync),
          "foo.js": "foo",
          "bar.js": "bar",
          "baz.js": "baz",
        });
      });

      it("does not throw ENOENT errors when deleting files", async () => {
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [],
              deleted: [{ path: "nope.js" }],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        expect(sync.status).toBe(SyncStatus.RUNNING);
      });

      it("runs `yarn install` when yarn.lock changes", async () => {
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [
                {
                  path: "yarn.lock",
                  content: toBase64("# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY."),
                  mode: 493,
                  encoding: FileSyncEncoding.Base64,
                },
              ],
              deleted: [],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        expect(execa.mock.lastCall).toEqual(["yarn", ["install"], { cwd: dir }]);
      });

      it("does not run `yarn install` when yarn.lock is deleted", async () => {
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [],
              deleted: [{ path: "yarn.lock" }],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        expect(execa).not.toHaveBeenCalled();
      });

      it("writes deletes before changes", async () => {
        await setupDir(dir, {
          "foo/": {},
        });

        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [{ path: "foo/baz.js", content: toBase64("// baz.js"), mode: 0o644, encoding: FileSyncEncoding.Base64 }],
              deleted: [{ path: "foo/" }],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        await expectDir(dir, {
          ".gadget/backup/foo/": "",
          ".gadget/sync.json": stateFile(sync),
          "foo/baz.js": "// baz.js",
        });
      });

      describe("with an ignore file", () => {
        beforeEach(async () => {
          await setupDir(dir, {
            ".ignore": "file2.js",
            "file1.js": "one",
            "file2.js": "two",
            "file3.js": "three",
          });

          sync.ignorer.reload();
        });

        it("reloads the ignore file when it changes", async () => {
          client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "1",
                changed: [{ path: ".ignore", content: toBase64(""), mode: 420, encoding: FileSyncEncoding.Base64 }],
                deleted: [],
              },
            },
          });

          await sleepUntil(() => sync.state.filesVersion == 1n);

          emit.all("change", path.join(dir, "file1.js"));
          emit.all("change", path.join(dir, "file2.js"));
          emit.all("change", path.join(dir, "file3.js"));

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

          expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
            input: {
              expectedRemoteFilesVersion: String(sync.state.filesVersion),
              changed: expect.arrayContaining([
                { path: "file1.js", content: toBase64("one"), mode: 420, encoding: FileSyncEncoding.Base64 },
                { path: "file2.js", content: toBase64("two"), mode: 420, encoding: FileSyncEncoding.Base64 },
                { path: "file3.js", content: toBase64("three"), mode: 420, encoding: FileSyncEncoding.Base64 },
              ]),
              deleted: [],
            },
          });
        });

        it("does not write changes to ignored files", async () => {
          client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "1",
                changed: [{ path: "file2.js", content: toBase64("two++"), mode: 420, encoding: FileSyncEncoding.Base64 }],
                deleted: [],
              },
            },
          });

          await sleepUntil(() => sync.state.filesVersion == 1n);

          // no changes
          await expectDir(dir, {
            ".gadget/sync.json": stateFile(sync),
            ".ignore": "file2.js",
            "file1.js": "one",
            "file2.js": "two",
            "file3.js": "three",
          });

          client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "2",
                changed: [],
                deleted: [{ path: "file2.js" }],
              },
            },
          });

          await sleepUntil(() => sync.state.filesVersion == 2n);

          // no changes
          await expectDir(dir, {
            ".gadget/sync.json": stateFile(sync),
            ".ignore": "file2.js",
            "file1.js": "one",
            "file2.js": "two",
            "file3.js": "three",
          });
        });

        it("does write changes to .gadget files even though they are always ignored", async () => {
          client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "1",
                changed: [
                  { path: ".gadget/client/index.ts", content: toBase64("// client"), mode: 420, encoding: FileSyncEncoding.Base64 },
                  { path: ".gadget/server/index.ts", content: toBase64("// server"), mode: 420, encoding: FileSyncEncoding.Base64 },
                ],
                deleted: [],
              },
            },
          });

          await sleepUntil(() => sync.state.filesVersion == 1n);

          await expectDir(dir, {
            ".gadget/sync.json": stateFile(sync),
            ".ignore": "file2.js",
            "file1.js": "one",
            "file2.js": "two",
            "file3.js": "three",
            ".gadget/client/index.ts": "// client",
            ".gadget/server/index.ts": "// server",
          });
        });
      });
    });

    describe("publishing", () => {
      it("publishes changed events on add/change events", async () => {
        await setupDir(dir, {
          "file.js": "foo",
          "some/deeply/nested/file.js": "bar",
        });

        emit.all("add", path.join(dir, "file.js"));
        emit.all("change", path.join(dir, "some/deeply/nested/file.js"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: expect.arrayContaining([
              { path: "file.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 },
              { path: "some/deeply/nested/file.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
            deleted: [],
          },
        });
      });

      it("publishes change event on rename events", async () => {
        // we setup the directory as it would be after the rename because we read file contents of the new file path
        await setupDir(dir, {
          "bar/": {
            "bar1.js": "foo1",
            "bar2.js": "foo2",
          },
          "bar.js": "bar",
          "baz.js": "baz",
        });

        emit.all("renameDir", path.join(dir, "foo/"), path.join(dir, "bar/"));
        emit.all("rename", path.join(dir, "foo/foo1.js"), path.join(dir, "bar/bar1.js"));
        emit.all("rename", path.join(dir, "foo/foo2.js"), path.join(dir, "bar/bar2.js"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: expect.arrayContaining([
              { path: "bar/", content: toBase64(""), mode: 420, encoding: FileSyncEncoding.Base64, oldPath: "foo/" },
              { path: "bar/bar1.js", content: toBase64("foo1"), mode: 420, encoding: FileSyncEncoding.Base64, oldPath: "foo/foo1.js" },
              { path: "bar/bar2.js", content: toBase64("foo2"), mode: 420, encoding: FileSyncEncoding.Base64, oldPath: "foo/foo2.js" },
            ]),
            deleted: [],
          },
        });
      });

      it("publishes deleted events on unlink events", async () => {
        emit.all("unlink", path.join(dir, "file.js"));
        emit.all("unlink", path.join(dir, "some/deeply/nested/file.js"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [],
            deleted: expect.arrayContaining([{ path: "file.js" }, { path: "some/deeply/nested/file.js" }]),
          },
        });
      });

      it("publishes events in batches after a debounced delay", async () => {
        await setupDir(dir, {
          "foo.js": "foo",
          "bar.js": "bar",
          "baz.js": "baz",
        });

        emit.all("add", path.join(dir, "foo.js"));
        await sleep();
        emit.all("add", path.join(dir, "bar.js"));
        await sleep();
        emit.all("add", path.join(dir, "baz.js"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: expect.arrayContaining([
              { path: "foo.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 },
              { path: "bar.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
              { path: "baz.js", content: toBase64("baz"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
            deleted: [],
          },
        });
      });

      it("publishes add events on addDir events", async () => {
        emit.all("addDir", path.join(dir, "some/deeply/nested/"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: expect.arrayContaining([{ path: "some/deeply/nested/", content: "", mode: 420, encoding: FileSyncEncoding.Base64 }]),
            deleted: [],
          },
        });
      });

      it("publishes delete events on unlinkDir events", async () => {
        emit.all("unlinkDir", path.join(dir, "some/deeply/nested/"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [],
            deleted: expect.arrayContaining([{ path: "some/deeply/nested/" }]),
          },
        });
      });

      it("does not publish changed events from files that were deleted after the change event but before publish", async () => {
        await setupDir(dir, {
          "another.js": "test",
        });

        emit.all("change", path.join(dir, "delete_me.js"));
        emit.all("add", path.join(dir, "another.js"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: expect.arrayContaining([
              { path: "another.js", content: toBase64("test"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
            deleted: [],
          },
        });
      });

      it("does not publish events from files contained in recentWrites", () => {
        vi.spyOn(sync, "publish");

        // add files to recentWrites
        sync.recentRemoteChanges.add("foo.js");
        sync.recentRemoteChanges.add("bar.js");

        // emit events affecting the files in recentWrites
        emit.all("add", path.join(dir, "foo.js"));
        emit.all("unlink", path.join(dir, "bar.js"));

        // expect no events to have been published
        expect(sync.publish).not.toHaveBeenCalled();

        // the files in recentWrites should be removed so that sub events affecting them can be published
        expect(sync.recentRemoteChanges.has(path.join(dir, "foo.js"))).toBe(false);
        expect(sync.recentRemoteChanges.has(path.join(dir, "bar.js"))).toBe(false);
      });

      it("does not publish multiple batches of events at the same time", async () => {
        await setupDir(dir, {
          "foo.js": "foo",
          "bar.js": "bar",
          "baz.js": "baz",
        });

        // emit the first batch of events
        emit.all("add", path.join(dir, "foo.js"));

        // wait for the first batch to be queued
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

        // the first batch should be in progress
        expect(sync.queue.size).toBe(0);
        expect(sync.queue.pending).toBe(1);
        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: expect.arrayContaining([{ path: "foo.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 }]),
            deleted: [],
          },
        });

        // emit another batch of events while the first batch is still in progress
        emit.all("add", path.join(dir, "bar.js"));
        emit.all("add", path.join(dir, "baz.js"));

        // wait for the second batch to be queued
        await sleepUntil(() => sync.queue.size == 1);

        // the first batch should still be in progress
        expect(sync.queue.pending).toBe(1);
        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: expect.arrayContaining([{ path: "foo.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 }]),
            deleted: [],
          },
        });

        // let the first batch complete
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        // delete the subscription so that we can wait for the second batch to be queued
        client._subscriptions.delete(PUBLISH_FILE_SYNC_EVENTS_MUTATION);

        // wait for the second batch to be queued
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

        // the second batch should be in progress
        expect(sync.queue.size).toBe(0);
        expect(sync.queue.pending).toBe(1);
        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: expect.arrayContaining([
              { path: "bar.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
              { path: "baz.js", content: toBase64("baz"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
            deleted: [],
          },
        });

        // let the second batch to complete
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

        // wait for the second batch to complete
        await sleepUntil(() => sync.state.filesVersion == 2n);
      });

      it("does not publish multiple events affecting the same file", async () => {
        await setupDir(dir, {
          "file.js": "foo",
        });

        // emit a batch of events that affect the same file
        emit.all("add", path.join(dir, "file.js"));
        emit.all("change", path.join(dir, "file.js"));
        emit.all("unlink", path.join(dir, "file.js"));

        // add a small delay and then emit one more event that affects the same file
        await sleep();
        emit.all("add", path.join(dir, "file.js"));

        // wait for the publish to be queued
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        // only one event should be published
        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: expect.arrayContaining([{ path: "file.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 }]),
            deleted: [],
          },
        });
      });

      describe("with an ignore file", () => {
        beforeEach(async () => {
          await setupDir(dir, {
            ".ignore": `
# Ignore these
**/file.js

# JS files in the "watch" folder are super important though!
!watch/**/*.js
`,
            "file.js": "foo",
            "some/deeply/file.js": "bar",
            "some/deeply/nested/file.js": "bar",
            "watch/me/file.js": "bar",
          });

          sync.ignorer.reload();
        });

        it("does not publish changes from ignored paths", async () => {
          emit.all("add", path.join(dir, "file.js"));
          emit.all("unlink", path.join(dir, "some/deeply/file.js"));
          emit.all("change", path.join(dir, "some/deeply/nested/file.js"));
          emit.all("change", path.join(dir, "watch/me/file.js"));

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

          expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
            input: {
              expectedRemoteFilesVersion: String(sync.state.filesVersion),
              changed: expect.arrayContaining([
                { path: "watch/me/file.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
              ]),
              deleted: [],
            },
          });
        });

        it("reloads the ignore file when it changes", async () => {
          vi.spyOn(sync, "publish");

          emit.all("add", path.join(dir, "file.js"));
          emit.all("unlink", path.join(dir, "some/deeply/file.js"));
          emit.all("change", path.join(dir, "some/deeply/nested/file.js"));

          expect(sync.publish).not.toHaveBeenCalled();

          await setupDir(dir, {
            ".ignore": "# watch it all",
            "file.js": "foo",
            "some/deeply/file.js": "bar",
            "some/deeply/nested/file.js": "not bar",
            "watch/me/file.js": "bar",
          });

          emit.all("change", path.join(dir, ".ignore"));
          emit.all("change", path.join(dir, "some/deeply/nested/file.js"));
          emit.all("change", path.join(dir, "watch/me/file.js"));

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

          expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
            input: {
              expectedRemoteFilesVersion: String(sync.state.filesVersion),
              changed: expect.arrayContaining([
                { path: ".ignore", content: toBase64("# watch it all"), mode: 420, encoding: FileSyncEncoding.Base64 },
                { path: "some/deeply/nested/file.js", content: toBase64("not bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
                { path: "watch/me/file.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
              ]),
              deleted: [],
            },
          });
        });
      });
    });
  });

  describe("stop", () => {
    let run: Promise<void>;

    beforeEach(async () => {
      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;

      run = sync.run();

      vi.spyOn(sync.queue, "onIdle");
    });

    it("waits for the queue to be empty", async () => {
      await setupDir(dir, {
        "foo.js": "foo",
      });

      // send a remote change event
      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
        data: {
          remoteFileSyncEvents: {
            remoteFilesVersion: "2",
            changed: [{ path: "bar.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 }],
            deleted: [],
          },
        },
      });

      // send a local change event
      emit.all("add", path.join(dir, "foo.js"));

      const stop = sync.stop();

      // writing bar.js should be pending
      expect(sync.queue.pending).toBe(1);

      await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

      // writing bar.js should be done and publishing foo.js should be pending
      expect(sync.queue.pending).toBe(1);
      expect(sync.queue.size).toBe(0);

      client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

      await stop;
      expect(sync.queue.onIdle).toHaveBeenCalled();
      expect(sync.queue.pending).toBe(0);
      expect(sync.queue.size).toBe(0);

      await expectDir(dir, {
        ".gadget/sync.json": stateFile(sync),
        "foo.js": "foo",
        "bar.js": "bar",
      });
    });

    it("saves state to .gadget/sync.json", async () => {
      await sync.stop();

      await expectDir(dir, {
        ".gadget/sync.json": stateFile(sync),
      });
    });

    it("notifies the user when an error occurs", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBe(true);
      expect(sync.on).toHaveBeenCalledTimes(2);

      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.error(new ClientError({} as any, "test"));

      await expect(run).rejects.toThrow(ClientError);
      expect(notifier.notify).toHaveBeenCalledWith(
        {
          title: "Gadget",
          subtitle: "Uh oh!",
          message: "An error occurred while syncing files",
          sound: true,
          timeout: false,
          icon: path.join(__dirname, "..", "..", "assets", "favicon-128@4x.png"),
          contentImage: path.join(__dirname, "..", "..", "assets", "favicon-128@4x.png"),
        },
        expect.any(Function)
      );
    });

    it("closes all resources when subscription emits error", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBe(true);
      expect(sync.on).toHaveBeenCalledTimes(2);

      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.error(new ClientError({} as any, "test"));

      await expect(run).rejects.toThrow(ClientError);
      expect(client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(1);
      expect(sync.queue.onIdle).toHaveBeenCalledTimes(1);
      expect(sync.watcher.close).toHaveBeenCalledTimes(1);
      expect(sync.client.dispose).toHaveBeenCalledTimes(1);
    });

    it("closes all resources when subscription emits response with errors", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBe(true);
      expect(sync.on).toHaveBeenCalledTimes(2);

      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({ errors: [new GraphQLError("boom")] });

      await expect(run).rejects.toThrow(ClientError);
      expect(client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(2);
      expect(sync.queue.onIdle).toHaveBeenCalledTimes(1);
      expect(sync.watcher.close).toHaveBeenCalledTimes(1);
      expect(sync.client.dispose).toHaveBeenCalledTimes(1);
    });

    it("closes all resources when watcher emits error", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBe(true);
      expect(sync.on).toHaveBeenCalledTimes(2);

      emit.error(new Error(expect.getState().currentTestName));

      await expect(run).rejects.toThrow(expect.getState().currentTestName);
      expect(client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(1);
      expect(sync.queue.onIdle).toHaveBeenCalledTimes(1);
      expect(sync.watcher.close).toHaveBeenCalledTimes(1);
      expect(sync.client.dispose).toHaveBeenCalledTimes(1);
    });
  });
});

function toBase64(str: string): string {
  return Buffer.from(str).toString(FileSyncEncoding.Base64);
}

function stateFile(sync: Sync): string {
  // make sure the state is flushed
  sync.state.flush();

  // @ts-expect-error _inner is private
  return prettyJson(sync.state._inner) + "\n";
}

function prettyJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}
