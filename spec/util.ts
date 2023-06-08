import fs from "fs-extra";
import _ from "lodash";
import normalizePath from "normalize-path";
import path from "path";
import type { JsonObject } from "type-fest";
import type { Payload, Query, Sink } from "../src/utils/client.js";
import { Client } from "../src/utils/client.js";
import { walkDir, walkDirSync } from "../src/utils/fs-utils.js";
import { expect, vi } from "vitest";
import assert from "assert";

export async function getError(fnThatThrows: () => unknown): Promise<any> {
  try {
    await fnThatThrows();
    expect.fail("Expected error to be thrown");
  } catch (error) {
    return error;
  }
}

export async function expectDir(dir: string, expected: Record<string, any>): Promise<void> {
  const actual: Record<string, string> = {};
  for await (const filepath of walkDir(dir)) {
    const isDirectory = (await fs.lstat(filepath)).isDirectory();
    const relativePath = path.relative(dir, filepath);
    actual[normalizePath(`${relativePath}${isDirectory ? "/" : ""}`, false)] = isDirectory ? "" : await fs.readFile(filepath, "utf-8");
  }
  expect(actual).toEqual(expected);
}

export function expectDirSync(dir: string, expected: Record<string, string>): void {
  const actual: Record<string, string> = {};
  for (const filepath of walkDirSync(dir)) {
    const isDirectory = fs.lstatSync(filepath).isDirectory();
    const relativePath = path.relative(dir, filepath);
    actual[normalizePath(`${relativePath}${isDirectory ? "/" : ""}`, false)] = isDirectory ? "" : fs.readFileSync(filepath, "utf-8");
  }
  expect(actual).toEqual(expected);
}

type FileOrDir =
  | string
  | {
      [filepath: string]: FileOrDir | string;
    };

export async function setupDir(dir: string, files: Record<string, FileOrDir>): Promise<void> {
  await fs.emptyDir(dir);
  for (const [filepath, content] of Object.entries(files)) {
    if (filepath.endsWith("/")) {
      if (_.isObject(content)) {
        await fs.ensureDir(path.join(dir, filepath));
        await setupDir(path.join(dir, filepath), content);
      }
    } else {
      assert(_.isString(content), "file contents must be a string");
      await fs.outputFile(path.join(dir, filepath), content);
    }
  }
}

export interface MockSubscription<Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject> {
  sink: Sink<Data, Extensions>;
  payload: Payload<Data, Variables>;
  unsubscribe: () => void;
}

export interface MockClient extends Client {
  _subscriptions: Map<string, MockSubscription<JsonObject, JsonObject, JsonObject>>;
  _subscription<Data extends JsonObject, Variables extends JsonObject>(
    query: Query<Data, Variables>
  ): MockSubscription<Data, Variables, JsonObject>;
}

export function mockClient(): MockClient {
  const mock = {
    ...Client.prototype,
    _subscriptions: new Map(),
    _subscription: <Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject>(
      query: Query<Data, Variables, Extensions>
    ) => {
      expect(Array.from(mock._subscriptions.keys())).toContain(query);
      const sub = mock._subscriptions.get(query);
      expect(sub).toBeTruthy();
      return sub as MockSubscription<Data, Variables, Extensions>;
    },
  };

  vi.spyOn(Client.prototype, "dispose");
  vi.spyOn(Client.prototype, "subscribe").mockImplementation((payload, sink) => {
    if (!sink.complete) sink.complete = _.noop;

    const unsubscribe = vi.fn();
    vi.spyOn(sink, "next");
    vi.spyOn(sink, "error");
    vi.spyOn(sink, "complete");
    mock._subscriptions.set(payload.query, { payload, sink, unsubscribe });
    return unsubscribe;
  });

  return mock as MockClient;
}
