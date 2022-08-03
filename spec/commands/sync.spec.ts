import { Config as OclifConfig } from "@oclif/core";
import type { FSWatcher } from "chokidar";
import type { Stats } from "fs-extra";
import fs from "fs-extra";
import { GraphQLError } from "graphql";
import { prompt } from "inquirer";
import path from "path";
import type { MarkRequired } from "ts-essentials";
import type { InterpreterFrom } from "xstate";
import { InterpreterStatus } from "xstate";
import type { machine } from "../../src/commands/sync";
import Sync, {
  Action,
  createService,
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILES_VERSION_QUERY,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
} from "../../src/commands/sync";
import { Config } from "../../src/lib/config";
import { logger } from "../../src/lib/logger";
import type { PublishFileSyncEventsMutationVariables } from "../../src/__generated__/graphql";
import { testDirPath } from "../jest.setup";
import type { MockGraphQLClient } from "../util";
import { expectDir, expectDirSync, mockClient, setupDir, sleep, sleepUntil } from "../util";

const stats = { mode: 420, mtime: new Date("2000-01-01T01:00:00Z") };

test.todo("publishing does not send file changes if you delete more than N files at once");

describe("sync", () => {
  let context: MockContext;
  let service: InterpreterFrom<typeof machine>;

  beforeEach(() => {
    service = createService(path.join(testDirPath(), "app"), {
      app: "test",
      "file-push-delay": 10,
      "file-poll-interval": 100,
      "file-stability-threshold": 500,
    });

    jest.spyOn(service, "start");
    jest.spyOn(service, "stop");
    jest.spyOn(service, "send");

    context = service.machine.context as MockContext;
    mockClient(context.client);

    jest.spyOn(context.queue, "onIdle");

    // TODO: we don't need to mock the watcher anymore since we're using the real filesystem
    jest.spyOn(context.watcher, "add").mockReturnThis();
    jest.spyOn(context.watcher, "close").mockImplementation();
    jest.spyOn(context.watcher, "on").mockImplementation((eventName, handler) => {
      expect(["error", "all"]).toContain(eventName);
      if (eventName === "error") {
        context.watcher._emit.error = handler;
      } else {
        context.watcher._emit.all = handler;
      }
      return context.watcher;
    });

    context.watcher._emit = {
      all: undefined as any,
      error: undefined as any,
    };
  });

  describe("command", () => {
    let oclifConfig: OclifConfig;

    beforeEach(async () => {
      oclifConfig = (await OclifConfig.load()) as OclifConfig;

      Sync.prototype.service = service;
    });

    it("starts the machine and stops it on SIGINT", async () => {
      Config.session = "test";

      let stop: undefined | (() => void | null);
      jest.spyOn(process, "on").mockImplementationOnce((event, callback) => {
        expect(event).toBe("SIGINT");
        stop = callback;
        return process;
      });

      void new Sync(["--app", "my-app", context.dir], oclifConfig).run();

      await sleepUntil(() => service.start.mock.calls.length > 0);
      expect(service.status).toBe(InterpreterStatus.Running);
      expect(stop).toBeTruthy();

      await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
      context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
      context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

      await sleepUntil(() => service.state.matches("running"));

      stop!();
      expect(service.send).toHaveBeenLastCalledWith({ type: "STOP" });

      await sleepUntil(() => service.state.matches("stopped"));
      expect(service.status).toBe(InterpreterStatus.Stopped);
    });
  });

  describe("machine", () => {
    afterEach(() => {
      service.stop();
    });

    describe("starting", () => {
      it("ensures `context.dir` exists", async () => {
        expect(fs.existsSync(context.dir)).toBeFalse();

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => service.state.matches("running"));
        expect(fs.existsSync(context.dir)).toBeTrue();
      });

      it("loads `context.metadata` from .ggt/sync.json", async () => {
        const metadata = { lastWritten: { filesVersion: "77", mtime: 1658153625236 } };
        await setupDir(context.dir, {
          ".ggt/sync.json": JSON.stringify(metadata),
        });

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        expect(context.metadata).toEqual(metadata);
      });

      it("uses default metadata if .ggt/sync.json does not exist", async () => {
        const defaultMetadata = { lastWritten: { filesVersion: "0", mtime: 0 } };

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        expect(context.metadata).toEqual(defaultMetadata);
      });

      it("logs a warning if .ggt/sync.json does not exist and the directory is not empty", async () => {
        await setupDir(context.dir, {
          "foo.js": "foo",
        });

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        expect(logger.warn.mock.calls[0]?.[0]).toMatchInlineSnapshot(`"⚠️ Could not find .ggt/sync.json in a non empty directory"`);
      });

      it("asks how to proceed if both local and remote files changed", async () => {
        await setupDir(context.dir, {
          ".ggt/sync.json": JSON.stringify({ lastWritten: { filesVersion: "1", mtime: Date.now() - 1000 } }),
          "foo.js": "foo",
          "bar.js": "bar",
        });

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "2" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => prompt.mock.calls.length > 0);
        expect(prompt.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
          Object {
            "choices": Array [
              "Cancel sync and do nothing",
              "Merge local files with remote",
              "Reset local files to remote",
            ],
            "message": "Both local and remote files have changed since the last sync. How would you like to proceed?",
            "name": "action",
            "type": "list",
          }
        `);
      });

      it("asks how to proceed if only local files changed", async () => {
        await setupDir(context.dir, {
          ".ggt/sync.json": JSON.stringify({ lastWritten: { filesVersion: "1", mtime: Date.now() - 1000 } }),
          "foo.js": "foo",
        });

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => prompt.mock.calls.length > 0);
        expect(prompt.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
          Object {
            "choices": Array [
              "Cancel sync and do nothing",
              "Merge local files with remote",
              "Reset local files to remote",
            ],
            "message": "Local files have changed since the last sync. How would you like to proceed?",
            "name": "action",
            "type": "list",
          }
        `);
      });

      it("does not ask how to proceed if only ignored files changed", async () => {
        await setupDir(context.dir, {
          ".ignore": "bar.js",
          "foo.js": "foo",
        });

        context.ignorer.reload();

        const stat = await fs.stat(context.absolute("foo.js"));
        await fs.outputJson(context.absolute(".ggt/sync.json"), {
          lastWritten: { filesVersion: "1", mtime: stat.mtime.getTime() },
        });

        // wait a bit so the mtime is different
        await sleep(10);

        // write an ignored file
        await fs.writeFile(context.absolute("bar.js"), "bar");

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => service.state.matches("running"));
        expect(prompt).not.toHaveBeenCalled();
      });

      it("does not ask how to proceed if only remote files changed", async () => {
        await setupDir(context.dir, {
          "foo.js": "foo",
        });

        const stat = await fs.stat(context.absolute("foo.js"));
        await fs.outputJSON(context.absolute(".ggt/sync.json"), {
          lastWritten: { filesVersion: "1", mtime: stat.mtime.getTime() },
        });

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "2" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => service.state.matches("running"));
        expect(prompt).not.toHaveBeenCalled();
      });

      it("does not ask how to proceed if neither local nor remote files changed", async () => {
        await setupDir(context.dir, {
          "foo.js": "foo",
        });

        const stat = await fs.stat(context.absolute("foo.js"));
        await fs.outputJson(context.absolute(".ggt/sync.json"), {
          lastWritten: { filesVersion: "1", mtime: stat.mtime.getTime() },
        });

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => service.state.matches("running"));
        expect(prompt).not.toHaveBeenCalled();
      });

      it("publishes changed events when told to merge", async () => {
        prompt.mockResolvedValue({ action: Action.MERGE });

        await setupDir(context.dir, {
          "foo.js": "foo",
          "bar.js": "bar",
        });

        const stat = await fs.stat(context.absolute("bar.js"));
        await fs.outputJSON(context.absolute(".ggt/sync.json"), {
          lastWritten: { filesVersion: "1", mtime: stat.mtime.getTime() },
        });

        // wait a bit so the mtime is different
        await sleep(10);

        // modify a file
        await fs.writeFile(context.absolute("bar.js"), "bar2", "utf-8");

        // add a new file
        await fs.writeFile(context.absolute("baz.js"), "baz", "utf-8");

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

        // foo.js didn't change, so it should not be included
        expect(
          context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
        ).toEqual<PublishFileSyncEventsMutationVariables>({
          input: {
            expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
            changed: expect.toIncludeAllMembers([
              { path: "bar.js", content: "bar2", mode: expect.toBeNumber() },
              { path: "baz.js", content: "baz", mode: expect.toBeNumber() },
            ]),
            deleted: [],
          },
        });
      });

      it("deletes local file changes and sets `context.metadata.lastWritten.filesVersion` to 0 when told to reset", async () => {
        prompt.mockResolvedValue({ action: Action.RESET });

        await setupDir(context.dir, {
          "foo.js": "foo",
          "bar.js": "bar",
        });

        const stat = await fs.stat(context.absolute("bar.js"));
        await fs.outputJSON(context.absolute(".ggt/sync.json"), {
          lastWritten: { filesVersion: "1", mtime: stat.mtime.getTime() },
        });

        // wait a bit so the mtime is different
        await sleep(10);

        // modify a file
        await fs.writeFile(context.absolute("bar.js"), "bar2", "utf-8");

        // add a new file
        await fs.writeFile(context.absolute("baz.js"), "baz", "utf-8");

        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "1" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => service.state.matches("running"));

        // foo.js didn't change, so it should still exist
        await expectDir(context.dir, {
          "foo.js": "foo",
          ".ggt/sync.json": JSON.stringify({ lastWritten: { filesVersion: "1", mtime: stat.mtime.getTime() } }) + "\n",
        });

        expect(context.metadata.lastWritten.filesVersion).toBe("0");
      });

      it("closes all resources when start throws an error", async () => {
        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.error(new Error("oops"));

        await sleepUntil(() => service.state.matches("stopped"));
        expect(service.status).toBe(InterpreterStatus.Stopped);
        expect(context.client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBeFalse();
        expect(context.queue.onIdle).toHaveBeenCalledTimes(1);
        expect(context.watcher.close).toHaveBeenCalledTimes(1);
        expect(context.client.dispose).toHaveBeenCalledTimes(1);
      });
    });

    describe("running", () => {
      beforeEach(async () => {
        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => service.state.matches("running"));
      });

      describe("writing", () => {
        it("writes changed files", async () => {
          context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "1",
                changed: [
                  { path: "file.js", content: "foo", mode: 420 },
                  { path: "some/deeply/nested/file.js", content: "bar", mode: 420 },
                ],
                deleted: [],
              },
            },
          });

          await sleepUntil(() => service.state.matches("running.idle"));

          await expectDir(context.dir, {
            "file.js": "foo",
            "some/deeply/nested/file.js": "bar",
          });
        });

        it("deletes deleted files", async () => {
          await setupDir(context.dir, {
            "file.js": "foo",
            "some/deeply/nested/file.js": "bar",
          });

          context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "1",
                changed: [],
                deleted: [{ path: "file.js" }, { path: "some/deeply/nested/file.js" }],
              },
            },
          });

          await sleepUntil(() => service.state.matches("running.idle"));

          await expectDir(context.dir, {});
        });

        it("adds changed and deleted files to recentWrites", async () => {
          context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "1",
                changed: [{ path: "foo.js", content: "foo", mode: 420 }],
                deleted: [{ path: "bar.js" }],
              },
            },
          });

          await sleepUntil(() => service.state.matches("running.idle"));

          expect(context.recentWrites.has(context.absolute("foo.js"))).toBeTrue();
          expect(context.recentWrites.has(context.absolute("bar.js"))).toBeTrue();
        });

        it("does not write multiple batches of events at the same time", async () => {
          // emit the first batch of events
          context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "1",
                changed: [{ path: "foo.js", content: "foo", mode: 420 }],
                deleted: [],
              },
            },
          });

          // the first batch should be in progress
          expect(context.queue.size).toBe(0);
          expect(context.queue.pending).toBe(1);

          // emit another batch of events while the first batch is in progress
          context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "2",
                changed: [
                  { path: "bar.js", content: "bar", mode: 420 },
                  { path: "baz.js", content: "baz", mode: 420 },
                ],
                deleted: [],
              },
            },
          });

          // the second batch should be queued
          expect(context.queue.size).toBe(1);

          // the first batch should still be in progress
          expect(context.queue.pending).toBe(1);

          // wait for the first batch to complete
          await new Promise<void>((resolve) => context.queue.once("next", resolve));

          // the first batch should be complete
          expectDirSync(context.dir, {
            "foo.js": "foo",
          });

          // the second batch should now be in progress
          expect(context.queue.size).toBe(0);
          expect(context.queue.pending).toBe(1);

          // wait for the second batch to complete
          await sleepUntil(() => service.state.matches("running.idle"));

          // the second batch should be complete
          await expectDir(context.dir, {
            "foo.js": "foo",
            "bar.js": "bar",
            "baz.js": "baz",
          });
        });

        it("does not throw ENOENT errors when deleting files", async () => {
          context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "1",
                changed: [],
                deleted: [{ path: "nope.js" }],
              },
            },
          });

          await sleepUntil(() => service.state.matches("running.idle"));

          expect(service.status).toBe(InterpreterStatus.Running);
        });

        it("does not write empty directories", async () => {
          context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
            data: {
              remoteFileSyncEvents: {
                remoteFilesVersion: "1",
                changed: [{ path: "dir/", content: "", mode: 493 }],
                deleted: [],
              },
            },
          });

          await sleepUntil(() => service.state.matches("running.idle"));

          await expectDir(context.dir, {});
        });

        describe("with an ignore file", () => {
          beforeEach(async () => {
            await setupDir(context.dir, {
              ".ignore": "file2.js",
              "file1.js": "one",
              "file2.js": "two",
              "file3.js": "three",
            });

            context.ignorer.reload();
          });

          it("reloads the ignore file when it changes", async () => {
            context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
              data: {
                remoteFileSyncEvents: {
                  remoteFilesVersion: "1",
                  changed: [{ path: ".ignore", content: "", mode: 420 }],
                  deleted: [],
                },
              },
            });

            await sleepUntil(() => service.state.matches("running.idle"));

            context.watcher._emit.all("change", context.absolute("file1.js"), stats);
            context.watcher._emit.all("change", context.absolute("file2.js"), stats);
            context.watcher._emit.all("change", context.absolute("file3.js"), stats);

            await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

            expect(
              context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
            ).toEqual<PublishFileSyncEventsMutationVariables>({
              input: {
                expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
                changed: expect.toIncludeAllMembers([
                  { path: "file1.js", content: "one", mode: 420 },
                  { path: "file2.js", content: "two", mode: 420 },
                  { path: "file3.js", content: "three", mode: 420 },
                ]),
                deleted: [],
              },
            });
          });
        });
      });

      describe("publishing", () => {
        it("publishes changed events on add/change events", async () => {
          await setupDir(context.dir, {
            "file.js": "foo",
            "some/deeply/nested/file.js": "bar",
          });

          context.watcher._emit.all("add", context.absolute("file.js"), stats);
          context.watcher._emit.all("change", context.absolute("some/deeply/nested/file.js"), stats);

          await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          expect(
            context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
          ).toEqual<PublishFileSyncEventsMutationVariables>({
            input: {
              expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
              changed: expect.toIncludeAllMembers([
                { path: "file.js", content: "foo", mode: 420 },
                { path: "some/deeply/nested/file.js", content: "bar", mode: 420 },
              ]),
              deleted: [],
            },
          });
        });

        it("publishes deleted events on unlink/unlinkDir events", async () => {
          context.watcher._emit.all("unlink", context.absolute("file.js"), stats);
          context.watcher._emit.all("unlinkDir", context.absolute("some/deeply/nested"), stats);

          await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          expect(
            context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
          ).toEqual<PublishFileSyncEventsMutationVariables>({
            input: {
              expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
              changed: [],
              deleted: expect.toIncludeAllMembers([{ path: "file.js" }, { path: "some/deeply/nested" }]),
            },
          });
        });

        it("publishes events in batches after a debounced delay", async () => {
          await setupDir(context.dir, {
            "foo.js": "foo",
            "bar.js": "bar",
            "baz.js": "baz",
          });

          context.watcher._emit.all("add", context.absolute("foo.js"), stats);
          await sleep();
          context.watcher._emit.all("add", context.absolute("bar.js"), stats);
          await sleep();
          context.watcher._emit.all("add", context.absolute("baz.js"), stats);

          await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          expect(
            context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
          ).toEqual<PublishFileSyncEventsMutationVariables>({
            input: {
              expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
              changed: expect.toIncludeAllMembers([
                { path: "foo.js", content: "foo", mode: 420 },
                { path: "bar.js", content: "bar", mode: 420 },
                { path: "baz.js", content: "baz", mode: 420 },
              ]),
              deleted: [],
            },
          });
        });

        it("does not publish addDir events", async () => {
          context.watcher._emit.all("addDir", context.absolute("some/deeply/nested/"), stats);
          await expect(() => sleepUntil(() => service.state.matches("running.publishing"))).rejects.toThrow();
          expect(context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION)).toBeFalse();
        });

        it("does not publish changed events from files that were deleted after the change event but before publish", async () => {
          await setupDir(context.dir, {
            "another.js": "test",
          });

          context.watcher._emit.all("change", context.absolute("delete_me.js"), stats);
          context.watcher._emit.all("add", context.absolute("another.js"), stats);

          await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          expect(
            context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
          ).toEqual<PublishFileSyncEventsMutationVariables>({
            input: {
              expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
              changed: expect.toIncludeAllMembers([{ path: "another.js", content: "test", mode: 420 }]),
              deleted: [],
            },
          });
        });

        it("does not publish events from files contained in recentWrites", async () => {
          // add files to recentWrites
          context.recentWrites.add(context.absolute("foo.js"));
          context.recentWrites.add(context.absolute("bar.js"));

          // emit events affecting the files in recentWrites
          context.watcher._emit.all("add", context.absolute("foo.js"), stats);
          context.watcher._emit.all("unlink", context.absolute("bar.js"), stats);

          // give the events a chance to be published (shouldn't happen)
          await expect(() => sleepUntil(() => service.state.matches("running.publishing"))).rejects.toThrow();

          // expect no events to have been published
          expect(context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION)).toBeFalse();

          // the files in recentWrites should be removed so that sub events affecting them can be published
          expect(context.recentWrites.has(context.absolute("foo.js"))).toBeFalse();
          expect(context.recentWrites.has(context.absolute("bar.js"))).toBeFalse();
        });

        it("does not publish multiple batches of events at the same time", async () => {
          await setupDir(context.dir, {
            "foo.js": "foo",
            "bar.js": "bar",
            "baz.js": "baz",
          });

          // emit the first batch of events
          context.watcher._emit.all("add", context.absolute("foo.js"), stats);

          // wait for the first batch to be queued
          await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          // the first batch should be in progress
          expect(context.queue.size).toBe(0);
          expect(context.queue.pending).toBe(1);
          expect(
            context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
          ).toEqual<PublishFileSyncEventsMutationVariables>({
            input: {
              expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
              changed: expect.toIncludeAllMembers([{ path: "foo.js", content: "foo", mode: 420 }]),
              deleted: [],
            },
          });

          // emit another batch of events while the first batch is still in progress
          context.watcher._emit.all("add", context.absolute("bar.js"), stats);
          context.watcher._emit.all("add", context.absolute("baz.js"), stats);

          // wait for the second batch to be queued
          await sleepUntil(() => context.queue.size == 1);

          // the first batch should still be in progress
          expect(context.queue.pending).toBe(1);
          expect(
            context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
          ).toEqual<PublishFileSyncEventsMutationVariables>({
            input: {
              expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
              changed: expect.toIncludeAllMembers([{ path: "foo.js", content: "foo", mode: 420 }]),
              deleted: [],
            },
          });

          // let the first batch complete
          context.client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "1" } } });
          context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.complete();

          // delete the subscription so that we can wait for the second batch to be queued
          context.client._subscriptions.delete(PUBLISH_FILE_SYNC_EVENTS_MUTATION);

          // wait for the second batch to be queued
          await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          // the second batch should be in progress
          expect(context.queue.size).toBe(0);
          expect(context.queue.pending).toBe(1);
          expect(
            context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
          ).toEqual<PublishFileSyncEventsMutationVariables>({
            input: {
              expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
              changed: expect.toIncludeAllMembers([
                { path: "bar.js", content: "bar", mode: 420 },
                { path: "baz.js", content: "baz", mode: 420 },
              ]),
              deleted: [],
            },
          });

          // let the second batch to complete
          context.client
            ._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION)
            .sink.next({ data: { publishFileSyncEvents: { remoteFilesVersion: "2" } } });
          context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.complete();

          // wait for the second batch to complete
          await sleepUntil(() => service.state.matches("running.idle"));
        });

        it("does not publish events caused by symlinked files", async () => {
          context.watcher._emit.all("change", context.absolute("symlink.js"), { ...stats, isSymbolicLink: () => true });

          await expect(() => sleepUntil(() => service.state.matches("running.publishing"))).rejects.toThrow();

          expect(context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION)).toBeFalse();
        });

        it("does not publish multiple events affecting the same file", async () => {
          await setupDir(context.dir, {
            "file.js": "foo",
          });

          // emit a batch of events that affect the same file
          context.watcher._emit.all("add", context.absolute("file.js"), stats);
          context.watcher._emit.all("change", context.absolute("file.js"), stats);
          context.watcher._emit.all("unlink", context.absolute("file.js"));

          // add a small delay and then emit one more event that affects the same file
          await sleep();
          context.watcher._emit.all("add", context.absolute("file.js"), stats);

          // wait for the publish to be queued
          await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

          // only one event should be published
          expect(
            context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
          ).toEqual<PublishFileSyncEventsMutationVariables>({
            input: {
              expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
              changed: expect.toIncludeAllMembers([{ path: "file.js", content: "foo", mode: 420 }]),
              deleted: [],
            },
          });
        });

        describe("with an ignore file", () => {
          beforeEach(async () => {
            await setupDir(context.dir, {
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

            context.ignorer.reload();
          });

          it("does not publish changes from ignored paths", async () => {
            context.watcher._emit.all("add", context.absolute("file.js"), stats);
            context.watcher._emit.all("unlink", context.absolute("some/deeply/file.js"), stats);
            context.watcher._emit.all("change", context.absolute("some/deeply/nested/file.js"), stats);
            context.watcher._emit.all("change", context.absolute("watch/me/file.js"), stats);

            await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

            expect(
              context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
            ).toEqual<PublishFileSyncEventsMutationVariables>({
              input: {
                expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
                changed: expect.toIncludeAllMembers([{ path: "watch/me/file.js", content: "bar", mode: 420 }]),
                deleted: [],
              },
            });
          });

          it("reloads the ignore file when it changes", async () => {
            context.watcher._emit.all("add", context.absolute("file.js"), stats);
            context.watcher._emit.all("unlink", context.absolute("some/deeply/file.js"), stats);
            context.watcher._emit.all("change", context.absolute("some/deeply/nested/file.js"), stats);

            await expect(() => sleepUntil(() => service.state.matches("running.publishing"))).rejects.toThrow();

            expect(context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION)).toBeFalse();

            await setupDir(context.dir, {
              ".ignore": "# watch it all",
              "file.js": "foo",
              "some/deeply/file.js": "bar",
              "some/deeply/nested/file.js": "not bar",
              "watch/me/file.js": "bar",
            });

            context.watcher._emit.all("change", context.absolute(".ignore"), stats);
            context.watcher._emit.all("change", context.absolute("some/deeply/nested/file.js"), stats);
            context.watcher._emit.all("change", context.absolute("watch/me/file.js"), stats);

            await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));

            expect(
              context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).payload.variables
            ).toEqual<PublishFileSyncEventsMutationVariables>({
              input: {
                expectedRemoteFilesVersion: context.metadata.lastWritten.filesVersion,
                changed: expect.toIncludeAllMembers([
                  { path: ".ignore", content: "# watch it all", mode: 420 },
                  { path: "some/deeply/nested/file.js", content: "not bar", mode: 420 },
                  { path: "watch/me/file.js", content: "bar", mode: 420 },
                ]),
                deleted: [],
              },
            });
          });
        });
      });
    });

    describe("stopping", () => {
      beforeEach(async () => {
        service.start();

        await sleepUntil(() => context.client._subscriptions.has(REMOTE_FILES_VERSION_QUERY));
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.next({ data: { remoteFilesVersion: "0" } });
        context.client._subscription(REMOTE_FILES_VERSION_QUERY).sink.complete();

        await sleepUntil(() => service.state.matches("running"));
      });

      it("waits for the queue to be empty", async () => {
        await setupDir(context.dir, {
          "foo.js": "foo",
        });

        // send a remote change event
        context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({
          data: {
            remoteFileSyncEvents: {
              remoteFilesVersion: "2",
              changed: [{ path: "bar.js", content: "bar", mode: 420 }],
              deleted: [],
            },
          },
        });

        // send a local change event
        context.watcher._emit.all("add", context.absolute("foo.js"), stats);

        service.send("STOP");
        expect(service.state.matches("stopping")).toBeTrue();

        // writing bar.js should be pending and publishing foo.js should be queued
        expect(context.queue.pending).toBe(1);
        expect(context.queue.size).toBe(1);

        await sleepUntil(() => context.client._subscriptions.has(PUBLISH_FILE_SYNC_EVENTS_MUTATION));
        expect(service.state.matches("stopping")).toBeTrue();

        // writing bar.js should be done and publishing foo.js should be pending
        expect(context.queue.pending).toBe(1);
        expect(context.queue.size).toBe(0);

        context.client._subscription(PUBLISH_FILE_SYNC_EVENTS_MUTATION).sink.next({
          data: {
            publishFileSyncEvents: {
              remoteFilesVersion: "2",
            },
          },
        });

        await sleepUntil(() => service.state.matches("stopped"));
        expect(context.queue.pending).toBe(0);
        expect(context.queue.size).toBe(0);

        await expectDir(context.dir, {
          ".ggt/sync.json": expect.toBeString(),
          "foo.js": "foo",
          "bar.js": "bar",
        });
      });

      it("saves `context.metadata` to .ggt/sync.json", async () => {
        const defaultMetadata = { lastWritten: { filesVersion: "0", mtime: 0 } };

        service.send("STOP");

        await sleepUntil(() => service.state.matches("stopped"));
        await expectDir(context.dir, {
          ".ggt/sync.json": JSON.stringify(defaultMetadata, null, 2) + "\n",
        });
      });

      it("closes all resources when subscription emits complete", async () => {
        expect(service.status).toBe(InterpreterStatus.Running);
        expect(context.client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBeTrue();
        expect(context.watcher.on).toHaveBeenCalledTimes(2);

        context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.complete();

        await sleepUntil(() => service.state.matches("stopped"));
        expect(service.status).toBe(InterpreterStatus.Stopped);
        expect(context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(1);
        expect(context.queue.onIdle).toHaveBeenCalledTimes(1);
        expect(context.watcher.close).toHaveBeenCalledTimes(1);
        expect(context.client.dispose).toHaveBeenCalledTimes(1);
      });

      it("closes all resources when subscription emits error", async () => {
        expect(service.status).toBe(InterpreterStatus.Running);
        expect(context.client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBeTrue();
        expect(context.watcher.on).toHaveBeenCalledTimes(2);

        context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.error(new Error());

        await sleepUntil(() => service.state.matches("stopped"));
        expect(service.status).toBe(InterpreterStatus.Stopped);
        expect(context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(1);
        expect(context.queue.onIdle).toHaveBeenCalledTimes(1);
        expect(context.watcher.close).toHaveBeenCalledTimes(1);
        expect(context.client.dispose).toHaveBeenCalledTimes(1);
      });

      it("closes all resources when subscription emits response with errors", async () => {
        expect(service.status).toBe(InterpreterStatus.Running);
        expect(context.client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBeTrue();
        expect(context.watcher.on).toHaveBeenCalledTimes(2);

        context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).sink.next({ errors: [new GraphQLError("boom")] });

        await sleepUntil(() => service.state.matches("stopped"));
        expect(service.status).toBe(InterpreterStatus.Stopped);
        expect(context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(1);
        expect(context.queue.onIdle).toHaveBeenCalledTimes(1);
        expect(context.watcher.close).toHaveBeenCalledTimes(1);
        expect(context.client.dispose).toHaveBeenCalledTimes(1);
      });

      it("closes all resources when watcher emits error", async () => {
        expect(service.status).toBe(InterpreterStatus.Running);
        expect(context.client._subscriptions.has(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION)).toBeTrue();
        expect(context.watcher.on).toHaveBeenCalledTimes(2);

        context.watcher._emit.error(new Error());

        await sleepUntil(() => service.state.matches("stopped"));
        expect(service.status).toBe(InterpreterStatus.Stopped);
        expect(context.client._subscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).unsubscribe).toHaveBeenCalledTimes(1);
        expect(context.queue.onIdle).toHaveBeenCalledTimes(1);
        expect(context.watcher.close).toHaveBeenCalledTimes(1);
        expect(context.client.dispose).toHaveBeenCalledTimes(1);
      });
    });
  });
});

type Context = typeof machine["context"];

interface MockContext extends Context {
  client: MockGraphQLClient;
  watcher: FSWatcher & {
    _emit: {
      all: (
        eventName: "add" | "addDir" | "change" | "unlink" | "unlinkDir",
        path: string,
        stats?: MarkRequired<Partial<Stats>, "mode" | "mtime">
      ) => void;
      error: (error: unknown) => void;
    };
  };
}
