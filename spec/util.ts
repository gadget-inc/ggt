import fs from "fs-extra";
import type { ExecutionResult, Sink } from "graphql-ws";
import normalizePath from "normalize-path";
import path from "path";
import type { JsonObject } from "type-fest";
import type { Payload, Query } from "../src/lib/client";
import { GraphQLClient } from "../src/lib/client";
import { walkDir, walkDirSync } from "../src/lib/walk-dir";

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

export interface MockGraphQLClient extends GraphQLClient {
  _subscriptions: Map<string, MockSubscription<JsonObject, JsonObject>>;
  _subscription<Data extends JsonObject, Variables extends JsonObject>(query: Query<Data, Variables>): MockSubscription<Data, Variables>;
}

export function mockClient(): MockGraphQLClient {
  const mock = {
    ...GraphQLClient.prototype,
    _subscriptions: new Map(),
    _subscription: <Data, Variables extends JsonObject>(query: Query<Data, Variables>) => {
      expect(mock._subscriptions.keys()).toContain(query);
      const sub = mock._subscriptions.get(query);
      expect(sub).toBeTruthy();
      return sub as MockSubscription<Data, Variables>;
    },
  };

  jest.spyOn(GraphQLClient.prototype, "dispose");
  jest.spyOn(GraphQLClient.prototype, "subscribe").mockImplementation((payload, sink) => {
    const unsubscribe = jest.fn();
    jest.spyOn(sink, "next");
    jest.spyOn(sink, "error");
    jest.spyOn(sink, "complete");
    mock._subscriptions.set(payload.query, { payload, sink, unsubscribe });
    return unsubscribe;
  });

  return mock as MockGraphQLClient;
}
