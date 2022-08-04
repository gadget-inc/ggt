import fs from "fs-extra";
import type { ExecutionResult, Sink } from "graphql-ws";
import normalizePath from "normalize-path";
import path from "path";
import type { JsonObject } from "type-fest";
import type { GraphQLClient, Payload, Query } from "../src/lib/client";
import { walkDir, walkDirSync } from "../src/lib/walk-dir";

export function sleep(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sleepUntil(fn: () => boolean, { interval = 0, timeout = 100 } = {}): Promise<void> {
  const start = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fn()) return;
    await sleep(interval);

    if (Date.now() - start > timeout) {
      const error = new Error(`Timed out after ${timeout} milliseconds`);
      Error.captureStackTrace(error, sleepUntil);
      throw error;
    }
  }
}

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

export function mockClient(client: GraphQLClient): asserts client is MockGraphQLClient {
  const mock = client as MockGraphQLClient;

  jest.spyOn(mock, "dispose");
  jest.spyOn(mock, "subscribe").mockImplementation((payload, sink) => {
    const unsubscribe = jest.fn();
    mock._subscriptions.set(payload.query, { sink, payload, unsubscribe });
    return unsubscribe;
  });

  mock._subscriptions = new Map();
  mock._subscription = <Data, Variables extends JsonObject>(query: Query<Data, Variables>) => {
    expect(mock._subscriptions.keys()).toContain(query);
    const sub = mock._subscriptions.get(query);
    expect(sub).toBeTruthy();
    return sub as MockSubscription<Data, Variables>;
  };
}
