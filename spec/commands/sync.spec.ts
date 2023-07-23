import { execa } from "execa";
import fs from "fs-extra";
import { GraphQLError } from "graphql";
import inquirer from "inquirer";
import _ from "lodash";
import notifier from "node-notifier";
import os from "os";
import path from "path";
import { dedent } from "ts-dedent";
import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
import which from "which";
import {
  FileSyncEncoding,
  type FileSyncChangedEvent,
  type FileSyncChangedEventInput,
  type MutationPublishFileSyncEventsArgs,
} from "../../src/__generated__/graphql.js";
import {
  Action,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILES_VERSION_QUERY,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
  Sync,
  SyncState,
  SyncStatus,
} from "../../src/commands/sync.js";
import { context, globalArgs } from "../../src/services/context.js";
import { ArgError, ClientError, InvalidSyncFileError, YarnNotFoundError } from "../../src/services/errors.js";
import { walkDirSync } from "../../src/services/fs-utils.js";
import { sleep, sleepUntil } from "../../src/services/sleep.js";
import type { PartialExcept } from "../types.js";
import type { MockClient } from "../util.js";
import { getError, mockClient, testDirPath } from "../util.js";

it.todo("publishing does not send file changes if you delete more than N files at once");

describe("Sync", () => {
  let client: MockClient;
  let dir: string;
  let app: string;
  let sync: Sync;

  beforeEach(() => {
    client = mockClient();
    dir = path.join(testDirPath(), "app");
    app = "test";
    globalArgs._ = [dir, "--app", app];

    sync = new Sync();

    vi.spyOn(context, "getUser").mockResolvedValue({ id: 1, name: "Jane Doe", email: "jane@example.come" });
    vi.spyOn(context, "getAvailableApps").mockResolvedValue([
      { id: "1", slug: "test", primaryDomain: "test.gadget.app", hasSplitEnvironments: true },
      { id: "2", slug: "not-test", primaryDomain: "not-test.gadget.app", hasSplitEnvironments: false },
    ]);
  });

  describe("init", () => {
    it("requires a user to be logged in", async () => {
      const error = new Error("not logged in");
      vi.spyOn(context, "requireUser").mockRejectedValueOnce(error);

      await expect(sync.init()).rejects.toThrow(error);
    });

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
      writeDir(dir, {
        "foo.js": "foo",
      });

      await expect(sync.init()).rejects.toThrow(InvalidSyncFileError);
    });

    it("throws InvalidSyncFileError if .gadget/sync.json is invalid and `dir` is not empty", async () => {
      writeDir(dir, {
        ".gadget": {
          // has trailing comma
          "sync.json": '{"app":"test","filesVersion":"77","mtime":1658153625236,}',
        },
      });

      await expect(sync.init()).rejects.toThrow(InvalidSyncFileError);
    });

    it("does not throw InvalidSyncFileError if .gadget/sync.json is invalid, `dir` is not empty, and `--force` is passed", async () => {
      writeDir(dir, {
        ".gadget": {
          // has trailing comma
          "sync.json": '{"app":"test","filesVersion":"77","mtime":1658153625236,}',
        },
      });

      globalArgs._.push("--force");
      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await expect(init).resolves.toBeUndefined();
    });

    it("throws ArgError if the `--app` flag is passed a different app name than the one in .gadget/sync.json", async () => {
      writeDir(dir, {
        ".gadget": {
          "sync.json": prettyJson({ app: "not-test", filesVersion: "77", mtime: 1658153625236 }),
        },
      });

      const error = await getError(() => sync.init());

      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toMatch(/^You were about to sync the following app to the following directory:/);
    });

    it("does not throw FlagError if the `--app` flag is passed a different app name than the one in .gadget/sync.json and `--force` is passed", async () => {
      writeDir(dir, {
        ".gadget": {
          "sync.json": prettyJson({ app: "not-test", filesVersion: "77", mtime: 1658153625236 }),
        },
      });

      globalArgs._.push("--force");
      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await expect(init).resolves.toBeUndefined();
    });

    it("asks how to proceed if both local and remote files changed", async () => {
      writeDir(dir, {
        ".gadget": {
          "sync.json": prettyJson({ app: "test", filesVersion: "1", mtime: Date.now() - 1000 }),
        },
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
      writeDir(dir, {
        ".gadget": {
          "sync.json": prettyJson({ app: "test", filesVersion: "1", mtime: Date.now() - 1000 }),
        },
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
      writeDir(dir, {
        ".ignore": "bar.js",
        "foo.js": "foo",
      });

      const stat = fs.statSync(path.join(dir, "foo.js"));
      fs.outputJsonSync(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      // wait a bit so the mtime is different
      await sleep(10);

      // write an ignored file
      fs.writeFileSync(path.join(dir, "bar.js"), "bar");

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it("does not ask how to proceed if only remote files changed", async () => {
      writeDir(dir, {
        "foo.js": "foo",
      });

      const stat = fs.statSync(path.join(dir, "foo.js"));
      fs.outputJSONSync(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "2" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it("does not ask how to proceed if neither local nor remote files changed", async () => {
      writeDir(dir, {
        "foo.js": "foo",
      });

      const stat = fs.statSync(path.join(dir, "foo.js"));
      fs.outputJsonSync(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it("publishes changed events when told to merge", async () => {
      inquirer.prompt.mockResolvedValue({ action: Action.MERGE });

      writeDir(dir, {
        "foo.js": "foo",
        "bar.js": "bar",
      });

      const stat = fs.statSync(path.join(dir, "bar.js"));
      fs.outputJSONSync(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      // wait a bit so the mtime is different
      await sleep(10);

      // modify a file
      fs.writeFileSync(path.join(dir, "bar.js"), "bar2", "utf-8");

      // add a new file
      fs.writeFileSync(path.join(dir, "baz.js"), "baz", "utf-8");

      void sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
      client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

      // foo.js didn't change, so it should not be included
      expectPublishToEqual(client, {
        input: {
          expectedRemoteFilesVersion: String(sync.state.filesVersion),
          changed: [fileChangedEvent({ path: "bar.js", content: "bar2" }), fileChangedEvent({ path: "baz.js", content: "baz" })],
          deleted: [],
        },
      });
    });

    it("deletes local file changes and sets `state.filesVersion` to 0 when told to reset", async () => {
      inquirer.prompt.mockResolvedValue({ action: Action.RESET });

      writeDir(dir, {
        "foo.js": "foo",
        "bar.js": "bar",
      });

      const stat = fs.statSync(path.join(dir, "bar.js"));
      fs.outputJSONSync(path.join(dir, ".gadget/sync.json"), { app: "test", filesVersion: "1", mtime: stat.mtime.getTime() });

      // wait a bit so the mtime is different
      await sleep(10);

      // modify a file
      fs.writeFileSync(path.join(dir, "bar.js"), "bar2", "utf-8");

      // add a new file
      fs.writeFileSync(path.join(dir, "baz.js"), "baz", "utf-8");

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;

      // foo.js didn't change, so it should still exist
      expectDir(sync, {
        ".gadget": {
          "sync.json": stateFile(sync),
          backup: {
            "bar.js": "bar2",
            "baz.js": "baz",
          },
        },
        "foo.js": "foo",
      });

      expect(sync.state.filesVersion).toBe(0n);
    });
  });

  describe("run", () => {
    let run: Promise<void>;

    beforeEach(async () => {
      vi.spyOn(process, "on").mockImplementation(_.noop as any);

      const init = sync.init();

      await sleepUntil(() => client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await init;

      run = sync.run();

      vi.spyOn(sync, "publish");

      // give the watcher some event loop ticks to finish setting up
      await sleep(10);
    });

    afterEach(async (context) => {
      // restore so sync.publish.flush() doesn't throw
      sync.publish.mockRestore();

      if (context.task.result?.state == "fail") {
        // the test failed... make sure sync.stop() isn't going to be blocked by a pending publish
        sync.publish.flush();
        await sleep(1);
        if (client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION)) {
          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: String(sync.state.filesVersion) } } });
        }
      }

      await sync.stop();
      await run;
    });

    describe("writing", () => {
      it("writes changed files", async () => {
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [
                fileChangedEvent({ path: "file.js", content: "foo" }),
                fileChangedEvent({ path: "some/deeply/nested/file.js", content: "bar" }),
              ],
              deleted: [],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion === 1n);

        expectDir(sync, {
          ".gadget": {
            "sync.json": stateFile(sync),
          },
          "file.js": "foo",
          some: {
            deeply: {
              nested: {
                "file.js": "bar",
              },
            },
          },
        });
      });

      it("writes empty directories", async () => {
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [dirChangedEvent({ path: "dir/", content: "" })],
              deleted: [],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        expectDir(sync, {
          ".gadget": {
            "sync.json": stateFile(sync),
          },
          dir: {},
        });
      });

      it("deletes deleted files", async () => {
        writeDir(dir, {
          "file.js": "foo",
          some: {
            deeply: {
              nested: {
                "file.js": "bar",
              },
            },
          },
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

        expectDir(sync, {
          ".gadget": {
            "sync.json": stateFile(sync),
            backup: {
              "file.js": "foo",
              some: {
                deeply: {
                  nested: {
                    "file.js": "bar",
                  },
                },
              },
            },
          },
          some: {
            deeply: {
              nested: {},
            },
          },
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
              changed: [fileChangedEvent({ path: "foo.js", content: "foo" })],
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
              changed: [fileChangedEvent({ path: "foo.js", content: "foo" })],
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
              changed: [fileChangedEvent({ path: "bar.js", content: "bar" }), fileChangedEvent({ path: "baz.js", content: "baz" })],
              deleted: [],
            },
          },
        });

        // the second batch should be queued
        expect(sync.queue.size).toBe(1);

        // the first batch should still be in progress
        expect(sync.queue.pending).toBe(1);

        // wait for the first batch to complete
        await sleepUntil(() => sync.state.filesVersion == 1n);

        // the first batch should be complete
        expectDir(sync, {
          ".gadget": {
            "sync.json": stateFile(sync),
          },
          "foo.js": "foo",
        });

        // the second batch should now be in progress
        expect(sync.queue.size).toBe(0);
        expect(sync.queue.pending).toBe(1);

        // wait for the second batch to complete
        await sleepUntil(() => sync.state.filesVersion == 2n);

        // the second batch should be complete
        expectDir(sync, {
          ".gadget": {
            "sync.json": stateFile(sync),
          },
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
                fileChangedEvent({ path: "yarn.lock", content: "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY." }),
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
        writeDir(dir, {
          foo: {},
        });

        // emit an event that both deletes a directory and changes a file in that directory
        client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "1",
              changed: [fileChangedEvent({ path: "foo/baz.js", content: "// baz.js" })],
              deleted: [{ path: "foo/" }],
            },
          },
        });

        await sleepUntil(() => sync.state.filesVersion == 1n);

        // the directory should be deleted, but the file should still exist because it was changed after the delete
        expectDir(sync, {
          ".gadget": {
            "sync.json": stateFile(sync),
            backup: {
              foo: {},
            },
          },
          foo: {
            "baz.js": "// baz.js",
          },
        });
      });

      describe("with an ignore file", () => {
        beforeEach(async () => {
          writeDir(dir, {
            ".ignore": "file2.js",
            "file1.js": "one",
            "file3.js": "three",
          });

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

          expectPublishToEqual(client, {
            input: {
              expectedRemoteFilesVersion: String(sync.state.filesVersion),
              changed: [
                fileChangedEvent({ path: ".ignore", content: "file2.js" }),
                fileChangedEvent({ path: "file1.js", content: "one" }),
                fileChangedEvent({ path: "file3.js", content: "three" }),
              ],
              deleted: [],
            },
          });

          // delete the subscription so that we can wait for the next publish
          client._subscriptions.delete(PUBLISH_FILE_SYNC_EVENTS_MUTATION);

          // make expect(sync.publish).not.toHaveBeenCalled() work
          sync.publish.mockClear();
        });

        it("reloads the ignore file when it changes", async () => {
          client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "2",
                changed: [fileChangedEvent({ path: ".ignore", content: "" })],
                deleted: [],
              },
            },
          });

          await sleepUntil(() => sync.state.filesVersion == 2n);

          expectDir(sync, {
            ".gadget": {
              "sync.json": stateFile(sync),
            },
            ".ignore": "",
            "file1.js": "one",
            "file3.js": "three",
          });

          fs.outputFileSync(path.join(dir, "file2.js"), "two2");

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "3" } } });

          expectPublishToEqual(client, {
            input: {
              expectedRemoteFilesVersion: String(sync.state.filesVersion),
              changed: [fileChangedEvent({ path: "file2.js", content: "two2" })],
              deleted: [],
            },
          });
        });

        it("does not write changes to ignored files", async () => {
          client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "2",
                changed: [fileChangedEvent({ path: "file2.js", content: "two++" })],
                deleted: [],
              },
            },
          });

          await sleepUntil(() => sync.state.filesVersion == 2n);

          // no changes
          expectDir(sync, {
            ".gadget": {
              "sync.json": stateFile(sync),
            },
            ".ignore": "file2.js",
            "file1.js": "one",
            "file3.js": "three",
          });

          // manually write the file to make sure it doesn't get deleted
          fs.outputFileSync(path.join(dir, "file2.js"), "two");

          client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "3",
                changed: [],
                deleted: [{ path: "file2.js" }],
              },
            },
          });

          await sleepUntil(() => sync.state.filesVersion == 3n);

          // no changes
          expectDir(sync, {
            ".gadget": {
              "sync.json": stateFile(sync),
            },
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
                remoteFilesVersion: "2",
                changed: [
                  fileChangedEvent({ path: ".gadget/client/index.ts", content: "// client" }),
                  fileChangedEvent({ path: ".gadget/server/index.ts", content: "// server" }),
                ],
                deleted: [],
              },
            },
          });

          await sleepUntil(() => sync.state.filesVersion == 2n);

          expectDir(sync, {
            ".gadget": {
              "sync.json": stateFile(sync),
              client: {
                "index.ts": "// client",
              },
              server: {
                "index.ts": "// server",
              },
            },
            ".ignore": "file2.js",
            "file1.js": "one",
            "file3.js": "three",
          });
        });
      });
    });

    describe("publishing", () => {
      it("publishes changed events on add/change events", async () => {
        writeDir(dir, {
          "file.js": "foo",
          some: {
            deeply: {
              nested: {
                "file.js": "bar",
              },
            },
          },
        });

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [
              fileChangedEvent({ path: "file.js", content: "foo" }),
              dirChangedEvent({ path: "some/" }),
              dirChangedEvent({ path: "some/deeply/" }),
              dirChangedEvent({ path: "some/deeply/nested/" }),
              fileChangedEvent({ path: "some/deeply/nested/file.js", content: "bar" }),
            ],
            deleted: [],
          },
        });
      });

      it("publishes changed events on rename events", async () => {
        // setup the initial directory structure
        writeDir(dir, {
          bar: {
            "bar1.js": "bar1",
            "bar2.js": "bar2",
          },
        });

        // wait for the initial publish
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

        // let the first publish complete
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [
              dirChangedEvent({ path: "bar/" }),
              fileChangedEvent({ path: "bar/bar1.js", content: "bar1" }),
              fileChangedEvent({ path: "bar/bar2.js", content: "bar2" }),
            ],
            deleted: [],
          },
        });

        // delete the subscription so that we can wait for the next publish
        client._subscriptions.delete(PUBLISH_FILE_SYNC_EVENTS_MUTATION);

        fs.renameSync(path.join(dir, "bar/"), path.join(dir, "foo/"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [
              dirChangedEvent({ path: "foo/", oldPath: "bar/" }),
              fileChangedEvent({ path: "foo/bar1.js", oldPath: "bar/bar1.js", content: "bar1" }),
              fileChangedEvent({ path: "foo/bar2.js", oldPath: "bar/bar2.js", content: "bar2" }),
            ],
            deleted: [],
          },
        });
      });

      it("publishes deleted events on unlink events", async () => {
        // setup the initial directory structure
        writeDir(dir, {
          "file.js": "foo",
          some: {
            deeply: {
              nested: {
                "file.js": "bar",
              },
            },
          },
        });

        // wait for the initial publish
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

        // let the first publish complete
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [
              fileChangedEvent({ path: "file.js", content: "foo" }),
              dirChangedEvent({ path: "some/" }),
              dirChangedEvent({ path: "some/deeply/" }),
              dirChangedEvent({ path: "some/deeply/nested/" }),
              fileChangedEvent({ path: "some/deeply/nested/file.js", content: "bar" }),
            ],
            deleted: [],
          },
        });

        // delete the subscription so that we can wait for the next publish
        client._subscriptions.delete(PUBLISH_FILE_SYNC_EVENTS_MUTATION);

        fs.rmSync(path.join(dir, "file.js"));
        fs.rmSync(path.join(dir, "some/deeply/nested/file.js"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [],
            deleted: [{ path: "file.js" }, { path: "some/deeply/nested/file.js" }],
          },
        });
      });

      it("publishes events in batches after a debounced delay", async () => {
        fs.outputFileSync(path.join(dir, "foo.js"), "foo");
        await sleep(10);
        fs.outputFileSync(path.join(dir, "bar.js"), "bar");
        await sleep(10);
        fs.outputFileSync(path.join(dir, "baz.js"), "baz");

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [
              fileChangedEvent({ path: "foo.js", content: "foo" }),
              fileChangedEvent({ path: "bar.js", content: "bar" }),
              fileChangedEvent({ path: "baz.js", content: "baz" }),
            ],
            deleted: [],
          },
        });
      });

      it("publishes changed events on addDir events", async () => {
        writeDir(dir, {
          some: {
            deeply: {
              nested: {},
            },
          },
        });

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [
              dirChangedEvent({ path: "some/" }),
              dirChangedEvent({ path: "some/deeply/" }),
              dirChangedEvent({ path: "some/deeply/nested/" }),
            ],
            deleted: [],
          },
        });
      });

      it("publishes deleted events on unlinkDir events", async () => {
        writeDir(dir, {
          some: {
            deeply: {
              nested: {},
            },
          },
        });

        // wait for the initial publish
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

        // let the first publish complete
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [
              dirChangedEvent({ path: "some/" }),
              dirChangedEvent({ path: "some/deeply/" }),
              dirChangedEvent({ path: "some/deeply/nested/" }),
            ],
            deleted: [],
          },
        });

        // delete the subscription so that we can wait for the next publish
        client._subscriptions.delete(PUBLISH_FILE_SYNC_EVENTS_MUTATION);

        fs.removeSync(path.join(dir, "some/deeply/nested/"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [],
            deleted: [{ path: "some/deeply/nested/" }],
          },
        });
      });

      it("does not publish changed events from files that were deleted after the change event but before publish", async () => {
        writeDir(dir, {
          "another.js": "another",
          "delete_me.js": "delete_me",
        });

        // wait until both files have been published
        await sleepUntil(() => sync.publish.mock.calls.length == 2);

        // add the file we're about to delete to recentWrites so that it doesn't get published
        sync.recentRemoteChanges.add("delete_me.js");

        // delete the file
        fs.removeSync(path.join(dir, "delete_me.js"));

        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [fileChangedEvent({ path: "another.js", content: "another" })],
            deleted: [],
          },
        });
      });

      it("does not publish events from files contained in recentRemoteChanges", () => {
        // add files to recentRemoteChanges
        sync.recentRemoteChanges.add("foo.js");
        sync.recentRemoteChanges.add("bar.js");

        // write the files to the filesystem
        fs.outputFileSync(path.join(dir, "foo.js"), "foo");
        fs.outputFileSync(path.join(dir, "bar.js"), "bar");

        // expect no events to have been published
        expect(sync.publish).not.toHaveBeenCalled();

        // the files in recentWrites should be removed so that subsequent events affecting them can be published
        expect(sync.recentRemoteChanges.has(path.join(dir, "foo.js"))).toBe(false);
        expect(sync.recentRemoteChanges.has(path.join(dir, "bar.js"))).toBe(false);
      });

      it("does not publish multiple batches of events at the same time", async () => {
        // write the first file
        fs.outputFileSync(path.join(dir, "foo.js"), "foo");

        // wait for the first file to be queued
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

        // the first publish should be in progress
        expect(sync.queue.size).toBe(0);
        expect(sync.queue.pending).toBe(1);
        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [fileChangedEvent({ path: "foo.js", content: "foo" })],
            deleted: [],
          },
        });

        // write more files while the first publish is still in progress
        fs.outputFileSync(path.join(dir, "bar.js"), "bar");
        fs.outputFileSync(path.join(dir, "baz.js"), "baz");

        // wait for the second publish to be queued
        await sleepUntil(() => sync.queue.size == 1);

        // the first publish should still be in progress
        expect(sync.queue.pending).toBe(1);
        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [fileChangedEvent({ path: "foo.js", content: "foo" })],
            deleted: [],
          },
        });

        // let the first publish complete
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        // delete the subscription so that we can wait for the second publish to be start
        client._subscriptions.delete(PUBLISH_FILE_SYNC_EVENTS_MUTATION);

        // wait for the second publish to start
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

        // the second publish should be in progress
        expect(sync.queue.size).toBe(0);
        expect(sync.queue.pending).toBe(1);
        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [fileChangedEvent({ path: "bar.js", content: "bar" }), fileChangedEvent({ path: "baz.js", content: "baz" })],
            deleted: [],
          },
        });

        // let the second publish complete
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

        // wait for the second publish to complete
        await sleepUntil(() => sync.state.filesVersion == 2n);
      });

      it("does not publish multiple events affecting the same file", async () => {
        writeDir(dir, {
          "file.js": "foo",
        });

        // change the same file multiple times
        fs.outputFileSync(path.join(dir, "file.js"), "foo");
        fs.outputFileSync(path.join(dir, "file.js"), "foo1");
        fs.outputFileSync(path.join(dir, "file.js"), "foo2");

        // add a small delay and then emit one more event that affects the same file
        await sleep();
        fs.outputFileSync(path.join(dir, "file.js"), "foo3");

        // wait for the publish to be queued
        await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

        // only one event should be published
        expectPublishToEqual(client, {
          input: {
            expectedRemoteFilesVersion: String(sync.state.filesVersion),
            changed: [fileChangedEvent({ path: "file.js", content: "foo3" })],
            deleted: [],
          },
        });
      });

      describe("with an ignore file", () => {
        beforeEach(async () => {
          const ignoreContent = dedent`
            # Ignore these
            **/file.js

            # JS files in the "watch" folder are super important though!
            !watch/**/*.js
          `;

          fs.outputFileSync(path.join(dir, ".ignore"), ignoreContent);

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });

          expectPublishToEqual(client, {
            input: {
              expectedRemoteFilesVersion: String(sync.state.filesVersion),
              changed: [fileChangedEvent({ path: ".ignore", content: ignoreContent })],
              deleted: [],
            },
          });

          // delete the subscription so that we can wait for the next publish
          client._subscriptions.delete(PUBLISH_FILE_SYNC_EVENTS_MUTATION);

          // make expect(sync.publish).not.toHaveBeenCalled() work
          sync.publish.mockClear();
        });

        it("does not publish changes from ignored paths", async () => {
          fs.outputFileSync(path.join(dir, "another/file.js"), "another");
          fs.removeSync(path.join(dir, "another/file.js"));
          fs.outputFileSync(path.join(dir, "some/deeply/nested/file.js"), "not bar");
          fs.outputFileSync(path.join(dir, "watch/me/file.js"), "bar2");

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

          expectPublishToEqual(client, {
            input: {
              expectedRemoteFilesVersion: String(sync.state.filesVersion),
              changed: [
                dirChangedEvent({ path: "another/" }),
                dirChangedEvent({ path: "some/" }),
                dirChangedEvent({ path: "some/deeply/" }),
                dirChangedEvent({ path: "some/deeply/nested/" }),
                dirChangedEvent({ path: "watch/" }),
                dirChangedEvent({ path: "watch/me/" }),
                fileChangedEvent({ path: "watch/me/file.js", content: "bar2" }),
              ],
              deleted: [],
            },
          });
        });

        it("reloads the ignore file when it changes", async () => {
          fs.outputFileSync(path.join(dir, "file.js"), "foo");

          // give the watcher a chance to see the file
          await sleep(sync.args["--file-watch-debounce"]! + 100);

          // no changes should have been published
          expect(sync.publish).not.toHaveBeenCalled();

          // update the ignore file
          fs.writeFileSync(path.join(dir, ".ignore"), "# watch it all");

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

          // the ignore file should be reloaded and published
          expectPublishToEqual(client, {
            input: {
              expectedRemoteFilesVersion: String(sync.state.filesVersion),
              changed: [fileChangedEvent({ path: ".ignore", content: "# watch it all" })],
              deleted: [],
            },
          });

          // delete the subscription so that we can wait for the next publish
          client._subscriptions.delete(PUBLISH_FILE_SYNC_EVENTS_MUTATION);

          // update the previously ignored file
          fs.writeFileSync(path.join(dir, "file.js"), "foo2");

          await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
          client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "3" } } });

          expectPublishToEqual(client, {
            input: {
              expectedRemoteFilesVersion: String(sync.state.filesVersion),
              changed: [fileChangedEvent({ path: "file.js", content: "foo2" })],
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
      vi.spyOn(sync.watcher, "close");

      // give the watcher some event loop ticks to finish setting up
      await sleep(10);
    });

    it.each(["SIGINT", "SIGTERM"])("stops on %s", (signal) => {
      vi.spyOn(sync, "stop");

      const [, stop] = _.find(process.on.mock.calls, ([name]) => name === signal) ?? [];
      expect(stop).toBeTruthy();
      expect(sync.status).toBe(SyncStatus.RUNNING);

      stop();

      expect(sync.stop).toHaveBeenCalled();
      expect(sync.status).toBe(SyncStatus.STOPPING);
    });

    it("waits for the queue to be empty", async () => {
      const publish = vi.spyOn(sync, "publish");

      // make a local change
      fs.outputFileSync(path.join(dir, "foo.js"), "foo");

      // wait for the change to be published
      await sleepUntil(() => !!publish.mock.lastCall);

      // restore so sync.publish.flush() works
      publish.mockRestore();

      // make sure publish was debounced and the queue is still empty
      expect(sync.queue.pending + sync.queue.size).toBe(0);

      // emit a remote change event
      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
        data: {
          remoteFileSyncEvents: {
            remoteFilesVersion: "1",
            changed: [fileChangedEvent({ path: "bar.js", content: "bar" })],
            deleted: [],
          },
        },
      });

      // stop
      const stop = sync.stop();

      // publishing foo.js should be pending (running) and writing bar.js should be queued
      expect(sync.queue.pending).toBe(1);
      expect(sync.queue.size).toBe(1);

      await sleepUntil(() => client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
      client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });

      // publishing foo.js should be done and writing bar.js should be pending (running)
      expect(sync.queue.pending).toBe(1);
      expect(sync.queue.size).toBe(0);

      // wait for stop to complete
      await stop;

      // everything should be done
      expect(sync.queue.onIdle).toHaveBeenCalled();
      expect(sync.queue.pending).toBe(0);
      expect(sync.queue.size).toBe(0);

      expectDir(sync, {
        ".gadget": {
          "sync.json": stateFile(sync),
        },
        "foo.js": "foo",
        "bar.js": "bar",
      });
    });

    it("saves state to .gadget/sync.json", async () => {
      await sync.stop();

      expectDir(sync, {
        ".gadget": {
          "sync.json": stateFile(sync),
        },
      });
    });

    it("notifies the user when an error occurs", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBe(true);

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
        expect.any(Function),
      );
    });

    it("closes all resources when subscription emits error", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBe(true);

      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.error(new ClientError({} as any, "test"));

      await expect(run).rejects.toThrow(ClientError);
      expect(client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(1);
      expect(sync.queue.onIdle).toHaveBeenCalledTimes(1);
      expect(sync.watcher.close).toHaveBeenCalledTimes(1);
      expect(sync.client.dispose).toHaveBeenCalledTimes(1);
    });

    it("closes all resources when subscription emits response with errors", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBe(true);

      client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({ errors: [new GraphQLError("boom")] });

      await expect(run).rejects.toThrow(ClientError);
      expect(client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(2);
      expect(sync.queue.onIdle).toHaveBeenCalledTimes(1);
      expect(sync.watcher.close).toHaveBeenCalledTimes(1);
      expect(sync.client.dispose).toHaveBeenCalledTimes(1);
    });

    it("closes all resources when watcher emits error", async () => {
      expect(client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBe(true);

      sync.watcher.error(new Error(expect.getState().currentTestName));

      await expect(run).rejects.toThrow(expect.getState().currentTestName);
      expect(client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(1);
      expect(sync.queue.onIdle).toHaveBeenCalledTimes(1);
      expect(sync.watcher.close).toHaveBeenCalledTimes(1);
      expect(sync.client.dispose).toHaveBeenCalledTimes(1);
    });
  });
});

const defaultFileMode = os.platform() == "win32" ? 0o100666 : 0o100644;
const defaultDirMode = os.platform() == "win32" ? 0o40666 : 0o40755;

function stateFile(sync: Sync): string {
  // make sure the state is flushed
  sync.state.flush();

  // @ts-expect-error _inner is private
  return prettyJson(sync.state._inner) + "\n";
}

function prettyJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

function fileChangedEvent(
  options: PartialExcept<FileSyncChangedEventInput, "path" | "content">,
): FileSyncChangedEventInput & FileSyncChangedEvent {
  const event = _.defaults(options, {
    mode: defaultFileMode,
    encoding: FileSyncEncoding.Base64,
  } as FileSyncChangedEventInput);

  assert(event.encoding);
  event.content = Buffer.from(event.content).toString(event.encoding);

  return event as FileSyncChangedEventInput & FileSyncChangedEvent;
}

function dirChangedEvent(options: PartialExcept<FileSyncChangedEventInput, "path">): FileSyncChangedEventInput & FileSyncChangedEvent {
  assert(_.endsWith(options.path, "/"));
  return fileChangedEvent({ content: "", mode: defaultDirMode, ...options });
}

function expectPublishToEqual(client: MockClient, expected: MutationPublishFileSyncEventsArgs): void {
  const actual = client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables;
  assert(actual && typeof actual == "object");

  // sort the events by path so that toEqual() doesn't complain about the order
  actual.input.changed = _.sortBy(actual.input.changed, "path");
  actual.input.deleted = _.sortBy(actual.input.deleted, "path");
  expected.input.changed = _.sortBy(expected.input.changed, "path");
  expected.input.deleted = _.sortBy(expected.input.deleted, "path");

  expect(actual).toEqual(expected);
}

interface FileTree {
  [path: string]: FileTree | string;
}

function expectDir(sync: Sync, expected: FileTree): void {
  const actual: FileTree = {};
  for (const filepath of walkDirSync(sync.dir)) {
    const isDirectory = fs.lstatSync(filepath).isDirectory();
    const pathSegments = _.split(sync.relative(filepath), path.sep);
    _.set(actual, pathSegments, isDirectory ? {} : fs.readFileSync(filepath, "utf-8"));
  }
  expect(actual).toEqual(expected);
}

function writeDir(dir: string, tree: FileTree): void {
  for (const [filepath, content] of Object.entries(tree)) {
    if (_.isString(content)) {
      fs.outputFileSync(path.join(dir, filepath), content);
    } else {
      const subDir = path.join(dir, filepath);
      fs.ensureDirSync(subDir);
      writeDir(subDir, content);
    }
  }
}
