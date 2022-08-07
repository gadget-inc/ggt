import fs from "fs-extra";
import type { ExecutionResult, Sink } from "graphql-ws";
import normalizePath from "normalize-path";
import path from "path";
import type { JsonObject } from "type-fest";
import type { Payload, Query } from "../src/lib/client";
import { Client } from "../src/lib/client";
import { walkDir, walkDirSync } from "../src/lib/fs-utils";

export async function expectDir(dir: string, expected: Record<string, string>): Promise<void> {
  const actual: Record<string, string> = {};
  for await (const filepath of walkDir(dir)) {
    actual[normalizePath(path.relative(dir, filepath))] = await fs.readFile(filepath, "utf-8");
  }
  expect(actual).toEqual(expected);
}

export function expectDirSync(dir: string, expected: Record<string, string>): void {
  const actual: Record<string, string> = {};
  for (const filepath of walkDirSync(dir)) {
    actual[normalizePath(path.relative(dir, filepath))] = fs.readFileSync(filepath, "utf-8");
  }
  expect(actual).toEqual(expected);
}

export async function setupDir(dir: string, files: Record<string, string>): Promise<void> {
  await fs.emptyDir(dir);
  for (const [filepath, content] of Object.entries(files)) {
    await fs.outputFile(path.join(dir, filepath), content);
  }
}

export interface MockSubscription<Data, Variables extends JsonObject> {
  sink: Sink<ExecutionResult<Data>>;
  payload: Payload<Data, Variables>;
  unsubscribe: () => void;
}

export interface MockClient extends Client {
  _subscriptions: Map<string, MockSubscription<JsonObject, JsonObject>>;
  _subscription<Data extends JsonObject, Variables extends JsonObject>(query: Query<Data, Variables>): MockSubscription<Data, Variables>;
}

export function mockClient(): MockClient {
  const mock = {
    ...Client.prototype,
    _subscriptions: new Map(),
    _subscription: <Data, Variables extends JsonObject>(query: Query<Data, Variables>) => {
      expect(mock._subscriptions.keys()).toContain(query);
      const sub = mock._subscriptions.get(query);
      expect(sub).toBeTruthy();
      return sub as MockSubscription<Data, Variables>;
    },
  };

  jest.spyOn(Client.prototype, "dispose");
  jest.spyOn(Client.prototype, "subscribe").mockImplementation((payload, sink) => {
    const unsubscribe = jest.fn();
    jest.spyOn(sink, "next");
    jest.spyOn(sink, "error");
    jest.spyOn(sink, "complete");
    mock._subscriptions.set(payload.query, { payload, sink, unsubscribe });
    return unsubscribe;
  });

  return mock as MockClient;
}
