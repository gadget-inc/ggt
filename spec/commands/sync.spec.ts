import { FSWatcher } from "chokidar";
import execa from "execa";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import { GraphQLError } from "graphql";
import { prompt } from "inquirer";
import { notify } from "node-notifier";
import path from "path";
import type { SetRequired } from "type-fest";
import which from "which";
import Sync, {
  Action,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILES_VERSION_QUERY,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
  SyncStatus,
} from "../../src/commands/sync";
import { context } from "../../src/utils/context";
import { ClientError, FlagError, InvalidSyncFileError, YarnNotFoundError } from "../../src/utils/errors";
import { sleep, sleepUntil } from "../../src/utils/sleep";
import { FileSyncEncoding } from "../../src/__generated__/graphql";
import { testDirPath } from "../jest.setup";
import type { MockClient } from "../util";
import { expectDir, expectDirSync, getError, mockClient, setupDir } from "../util";

const stats = { mode: 420, mtime: new Date("2000-01-01T01:00:00Z") };

test.todo("publishing does not send file changes if you delete more than N files at once");

describe("Sync", () => {
  let dir: string;
  let client: MockClient;
  let sync: Sync;
  const emit: {
    all: (
      eventName: "add" | "addDir" | "change" | "unlink" | "unlinkDir",
      path: string,
      stats?: SetRequired<Partial<Stats>, "mode" | "mtime">
    ) => void;
    error: (error: unknown) => void;
  } = {
    all: undefined as any,
    error: undefined as any,
  };

  beforeEach(() => {
    dir = path.join(testDirPath(), "app");
    client = mockClient();
    sync = new Sync(["--app", "test", "--file-push-delay", "10", dir], context.config);

    jest.spyOn(context, "getUser").mockResolvedValue({ id: 1, name: "Jane Doe", email: "jane@example.come" });
    jest.spyOn(context, "getAvailableApps").mockResolvedValue([
      { id: "1", name: "test", slug: "test", hasSplitEnvironments: true },
      { id: "2", name: "not-test", slug: "not-test", hasSplitEnvironments: false },
    ]);

    // TODO: we don't need to mock the watcher anymore since we're using the real filesystem
    jest.spyOn(FSWatcher.prototype, "add").mockReturnThis();
    jest.spyOn(FSWatcher.prototype, "close").mockImplementation();
    jest.spyOn(FSWatcher.prototype, "on").mockImplementation(function (this: FSWatcher, eventName, handler) {
      switch (eventName) {
        case "all":
          emit.all = handler;
          break;
        case "error":
          emit.error = handler;
          break;
        default:
          throw new Error(`Unhandled eventName: ${eventName}`);
      }
      return this;
    });
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
      expect(fs.existsSync(dir)).toBeFalse();

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;
      expect(fs.existsSync(dir)).toBeTrue();
    });

    it("loads metadata from .gadget/sync.json", async () => {
      const metadata = { app: "test", filesVersion: "77", mtime: 1658153625236 };
      await setupDir(dir, {
        ".gadget/sync.json": JSON.stringify(metadata),
      });

      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      expect(sync.metadata).toEqual(metadata);
    });

    it("uses default metadata if .gadget/sync.json does not exist and `dir` is empty", async () => {
      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      expect(sync.metadata).toEqual({ app: "test", filesVersion: "0", mtime: 0 });
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
        ".gadget/sync.json": JSON.stringify({ app: "not-test", filesVersion: "77", mtime: 1658153625236 }),
      });

      const error = await getError(() => sync.init());

      expect(error).toBeInstanceOf(FlagError);
      expect(error.description).toStartWith("You were about to sync the following app to the following directory:");
    });

    it("does not throw FlagError if the `--app` flag is passed a different app name than the one in .gadget/sync.json and `--force` is passed", async () => {
      await setupDir(dir, {
        ".gadget/sync.json": JSON.stringify({ app: "not-test", filesVersion: "77", mtime: 1658153625236 }),
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
        ".gadget/sync.json": JSON.stringify({ app: "test", filesVersion: "1", mtime: Date.now() - 1000 }),
        "foo.js": "foo",
        "bar.js": "bar",
      });

      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "2" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await sleepUntil(() => prompt.mock.calls.length > 0);
      expect(prompt.mock.lastCall?.[0]).toMatchInlineSnapshot(`
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
        ".gadget/sync.json": JSON.stringify({ app: "test", filesVersion: "1", mtime: Date.now() - 1000 }),
        "foo.js": "foo",
      });

      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await sleepUntil(() => prompt.mock.calls.length > 0);
      expect(prompt.mock.lastCall?.[0]).toMatchInlineSnapshot(`
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
      expect(prompt).not.toHaveBeenCalled();
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
      expect(prompt).not.toHaveBeenCalled();
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
      expect(prompt).not.toHaveBeenCalled();
    });

    it("publishes changed events when told to merge", async () => {
      prompt.mockResolvedValue({ action: Action.MERGE });

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
          expectedRemoteFilesVersion: sync.metadata.filesVersion,
          changed: expect.toIncludeAllMembers([
            { path: "bar.js", content: toBase64("bar2"), mode: expect.toBeNumber(), encoding: FileSyncEncoding.Base64 },
            { path: "baz.js", content: toBase64("baz"), mode: expect.toBeNumber(), encoding: FileSyncEncoding.Base64 },
          ]),
          deleted: [],
        },
      });
    });

    it("deletes local file changes and sets `metadata.filesVersion` to 0 when told to reset", async () => {
      prompt.mockResolvedValue({ action: Action.RESET });

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
        "foo.js": "foo",
        ".gadget/sync.json": JSON.stringify({ app: "test", filesVersion: "1", mtime: stat.mtime.getTime() }) + "\n",
      });

      expect(sync.metadata.filesVersion).toBe("0");
    });
  });

  describe("run", () => {
    let run: Promise<void>;

    beforeEach(async () => {
      jest.spyOn(process, "on").mockImplementation();

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;

      run = sync.run();

      jest.spyOn(sync, "publish");
      jest.spyOn(sync, "stop");
    });

    afterEach(async () => {
      // restore so this.publish?.flush() doesn't throw
      sync.publish.mockRestore?.();
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

        await sleepUntil(() => sync.metadata.filesVersion === "1");

        await expectDir(dir, {
          "file.js": "foo",
          "some/deeply/nested/file.js": "bar",
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

        await sleepUntil(() => sync.metadata.filesVersion == "1");

        await expectDir(dir, {});
      });

      it("updates `metadata.filesVersion` even if nothing changed", async () => {
        expect(sync.metadata.filesVersion).toBe("0");

        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [],
              deleted: [],
            },
          },
        });

        await sleepUntil(() => sync.metadata.filesVersion == "1");

        expect(sync.metadata.filesVersion).toBe("1");
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

        await sleepUntil(() => sync.metadata.filesVersion == "1");

        expect(sync.recentWrites.has(path.join(dir, "foo.js"))).toBeTrue();
        expect(sync.recentWrites.has(path.join(dir, "bar.js"))).toBeTrue();
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
          "foo.js": "foo",
        });

        // the second batch should now be in progress
        expect(sync.queue.size).toBe(0);
        expect(sync.queue.pending).toBe(1);

        // wait for the second batch to complete
        await sleepUntil(() => sync.metadata.filesVersion == "2");

        // the second batch should be complete
        await expectDir(dir, {
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

        await sleepUntil(() => sync.metadata.filesVersion == "1");

        expect(sync.status).toBe(SyncStatus.RUNNING);
      });

      it("does not write empty directories", async () => {
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [{ path: "dir/", content: toBase64(""), mode: 493, encoding: FileSyncEncoding.Base64 }],
              deleted: [],
            },
          },
        });

        await sleepUntil(() => sync.metadata.filesVersion == "1");

        await expectDir(dir, {});
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

        await sleepUntil(() => sync.metadata.filesVersion == "1");

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

        await sleepUntil(() => sync.metadata.filesVersion == "1");

        expect(execa).not.toHaveBeenCalled();
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

          await sleepUntil(() => sync.metadata.filesVersion == "1");

          emit.all("change", path.join(dir, "file1.js"), stats);
          emit.all("change", path.join(dir, "file2.js"), stats);
          emit.all("change", path.join(dir, "file3.js"), stats);

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

          expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
            input: {
              expectedRemoteFilesVersion: sync.metadata.filesVersion,
              changed: expect.toIncludeAllMembers([
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

          await sleepUntil(() => sync.metadata.filesVersion == "1");

          // no changes
          await expectDir(dir, {
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

          await sleepUntil(() => sync.metadata.filesVersion == "2");

          // no changes
          await expectDir(dir, {
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

          await sleepUntil(() => sync.metadata.filesVersion == "1");

          await expectDir(dir, {
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

        emit.all("add", path.join(dir, "file.js"), stats);
        emit.all("change", path.join(dir, "some/deeply/nested/file.js"), stats);

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: sync.metadata.filesVersion,
            changed: expect.toIncludeAllMembers([
              { path: "file.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 },
              { path: "some/deeply/nested/file.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
            deleted: [],
          },
        });
      });

      it("publishes deleted events on unlink events", async () => {
        emit.all("unlink", path.join(dir, "file.js"), stats);
        emit.all("unlink", path.join(dir, "some/deeply/nested/file.js"), stats);

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: sync.metadata.filesVersion,
            changed: [],
            deleted: expect.toIncludeAllMembers([{ path: "file.js" }, { path: "some/deeply/nested/file.js" }]),
          },
        });
      });

      it("publishes events in batches after a debounced delay", async () => {
        await setupDir(dir, {
          "foo.js": "foo",
          "bar.js": "bar",
          "baz.js": "baz",
        });

        emit.all("add", path.join(dir, "foo.js"), stats);
        await sleep();
        emit.all("add", path.join(dir, "bar.js"), stats);
        await sleep();
        emit.all("add", path.join(dir, "baz.js"), stats);

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: sync.metadata.filesVersion,
            changed: expect.toIncludeAllMembers([
              { path: "foo.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 },
              { path: "bar.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
              { path: "baz.js", content: toBase64("baz"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
            deleted: [],
          },
        });
      });

      it("does not publish addDir events", () => {
        jest.spyOn(sync, "publish");

        emit.all("addDir", path.join(dir, "some/deeply/nested/"), stats);

        expect(sync.publish).not.toHaveBeenCalled();
      });

      it("does not publish unlinkDir events", () => {
        jest.spyOn(sync, "publish");

        emit.all("unlinkDir", path.join(dir, "some/deeply/nested/"), stats);

        expect(sync.publish).not.toHaveBeenCalled();
      });

      it("does not publish changed events from files that were deleted after the change event but before publish", async () => {
        await setupDir(dir, {
          "another.js": "test",
        });

        emit.all("change", path.join(dir, "delete_me.js"), stats);
        emit.all("add", path.join(dir, "another.js"), stats);

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: sync.metadata.filesVersion,
            changed: expect.toIncludeAllMembers([
              { path: "another.js", content: toBase64("test"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
            deleted: [],
          },
        });
      });

      it("does not publish events from files contained in recentWrites", () => {
        jest.spyOn(sync, "publish");

        // add files to recentWrites
        sync.recentWrites.add(path.join(dir, "foo.js"));
        sync.recentWrites.add(path.join(dir, "bar.js"));

        // emit events affecting the files in recentWrites
        emit.all("add", path.join(dir, "foo.js"), stats);
        emit.all("unlink", path.join(dir, "bar.js"), stats);

        // expect no events to have been published
        expect(sync.publish).not.toHaveBeenCalled();

        // the files in recentWrites should be removed so that sub events affecting them can be published
        expect(sync.recentWrites.has(path.join(dir, "foo.js"))).toBeFalse();
        expect(sync.recentWrites.has(path.join(dir, "bar.js"))).toBeFalse();
      });

      it("does not publish multiple batches of events at the same time", async () => {
        await setupDir(dir, {
          "foo.js": "foo",
          "bar.js": "bar",
          "baz.js": "baz",
        });

        // emit the first batch of events
        emit.all("add", path.join(dir, "foo.js"), stats);

        // wait for the first batch to be queued
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

        // the first batch should be in progress
        expect(sync.queue.size).toBe(0);
        expect(sync.queue.pending).toBe(1);
        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: sync.metadata.filesVersion,
            changed: expect.toIncludeAllMembers([
              { path: "foo.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
            deleted: [],
          },
        });

        // emit another batch of events while the first batch is still in progress
        emit.all("add", path.join(dir, "bar.js"), stats);
        emit.all("add", path.join(dir, "baz.js"), stats);

        // wait for the second batch to be queued
        await sleepUntil(() => sync.queue.size == 1);

        // the first batch should still be in progress
        expect(sync.queue.pending).toBe(1);
        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: sync.metadata.filesVersion,
            changed: expect.toIncludeAllMembers([
              { path: "foo.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
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
            expectedRemoteFilesVersion: sync.metadata.filesVersion,
            changed: expect.toIncludeAllMembers([
              { path: "bar.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
              { path: "baz.js", content: toBase64("baz"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
            deleted: [],
          },
        });

        // let the second batch to complete
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

        // wait for the second batch to complete
        await sleepUntil(() => sync.metadata.filesVersion == "2");
      });

      it("does not publish events caused by symlinked files", () => {
        jest.spyOn(sync, "publish");

        emit.all("change", path.join(dir, "symlink.js"), { ...stats, isSymbolicLink: () => true });

        expect(sync.publish).not.toHaveBeenCalled();
      });

      it("does not publish multiple events affecting the same file", async () => {
        await setupDir(dir, {
          "file.js": "foo",
        });

        // emit a batch of events that affect the same file
        emit.all("add", path.join(dir, "file.js"), stats);
        emit.all("change", path.join(dir, "file.js"), stats);
        emit.all("unlink", path.join(dir, "file.js"));

        // add a small delay and then emit one more event that affects the same file
        await sleep();
        emit.all("add", path.join(dir, "file.js"), stats);

        // wait for the publish to be queued
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        // only one event should be published
        expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
          input: {
            expectedRemoteFilesVersion: sync.metadata.filesVersion,
            changed: expect.toIncludeAllMembers([
              { path: "file.js", content: toBase64("foo"), mode: 420, encoding: FileSyncEncoding.Base64 },
            ]),
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
          emit.all("add", path.join(dir, "file.js"), stats);
          emit.all("unlink", path.join(dir, "some/deeply/file.js"), stats);
          emit.all("change", path.join(dir, "some/deeply/nested/file.js"), stats);
          emit.all("change", path.join(dir, "watch/me/file.js"), stats);

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

          expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
            input: {
              expectedRemoteFilesVersion: sync.metadata.filesVersion,
              changed: expect.toIncludeAllMembers([
                { path: "watch/me/file.js", content: toBase64("bar"), mode: 420, encoding: FileSyncEncoding.Base64 },
              ]),
              deleted: [],
            },
          });
        });

        it("reloads the ignore file when it changes", async () => {
          jest.spyOn(sync, "publish");

          emit.all("add", path.join(dir, "file.js"), stats);
          emit.all("unlink", path.join(dir, "some/deeply/file.js"), stats);
          emit.all("change", path.join(dir, "some/deeply/nested/file.js"), stats);

          expect(sync.publish).not.toHaveBeenCalled();

          await setupDir(dir, {
            ".ignore": "# watch it all",
            "file.js": "foo",
            "some/deeply/file.js": "bar",
            "some/deeply/nested/file.js": "not bar",
            "watch/me/file.js": "bar",
          });

          emit.all("change", path.join(dir, ".ignore"), stats);
          emit.all("change", path.join(dir, "some/deeply/nested/file.js"), stats);
          emit.all("change", path.join(dir, "watch/me/file.js"), stats);

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

          expect(client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables).toEqual({
            input: {
              expectedRemoteFilesVersion: sync.metadata.filesVersion,
              changed: expect.toIncludeAllMembers([
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

      jest.spyOn(sync.queue, "onIdle");
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
      emit.all("add", path.join(dir, "foo.js"), stats);

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
        ".gadget/sync.json": expect.toBeString(),
        "foo.js": "foo",
        "bar.js": "bar",
      });
    });

    it("saves metadata to .gadget/sync.json", async () => {
      await sync.stop();

      await expectDir(dir, {
        ".gadget/sync.json": JSON.stringify(sync.metadata, null, 2) + "\n",
      });
    });

    it("notifies the user when an error occurs", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBeTrue();
      expect(sync.watcher.on).toHaveBeenCalledTimes(2);

      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.error(new ClientError({} as any, "test"));

      await expect(run).rejects.toThrow(ClientError);
      expect(notify).toHaveBeenCalledWith(
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
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBeTrue();
      expect(sync.watcher.on).toHaveBeenCalledTimes(2);

      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.error(new ClientError({} as any, "test"));

      await expect(run).rejects.toThrow(ClientError);
      expect(client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(1);
      expect(sync.queue.onIdle).toHaveBeenCalledTimes(1);
      expect(sync.watcher.close).toHaveBeenCalledTimes(1);
      expect(sync.client.dispose).toHaveBeenCalledTimes(1);
    });

    it("closes all resources when subscription emits response with errors", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBeTrue();
      expect(sync.watcher.on).toHaveBeenCalledTimes(2);

      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({ errors: [new GraphQLError("boom")] });

      await expect(run).rejects.toThrow(ClientError);
      expect(client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(2);
      expect(sync.queue.onIdle).toHaveBeenCalledTimes(1);
      expect(sync.watcher.close).toHaveBeenCalledTimes(1);
      expect(sync.client.dispose).toHaveBeenCalledTimes(1);
    });

    it("closes all resources when watcher emits error", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBeTrue();
      expect(sync.watcher.on).toHaveBeenCalledTimes(2);

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
