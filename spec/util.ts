import Debug from "debug";
import _ from "lodash";
import path from "path";
import type { JsonObject } from "type-fest";
import { assert, expect, vi } from "vitest";
import type { Payload, Query, Sink } from "../src/services/client.js";
import { Client } from "../src/services/client.js";

export const testDebug = Debug("ggt:test");

export function testDirPath(): string {
  const name = expect.getState().currentTestName;
  assert(name, "Expected test name to be defined");

  const [testFile, ...rest] = _.split(name, " > ");
  const describes = rest.length > 1 ? rest.slice(0, -1) : [];
  const testName = rest.at(-1);

  assert(testFile && testName);

  return path.join(__dirname, "../tmp/", testFile, describes.join("/"), _.replace(testName, /[^\s\w-]/g, ""));
}

export const testStdout: string[] = [];

export const expectStdout = () => expect(testStdout.join(""));

export async function getError(fnThatThrows: () => unknown): Promise<any> {
  try {
    await fnThatThrows();
    expect.fail("Expected error to be thrown");
  } catch (error) {
    return error;
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
    query: Query<Data, Variables>,
  ): MockSubscription<Data, Variables, JsonObject>;
}

export function mockClient(): MockClient {
  const mock = {
    ...Client.prototype,
    _subscriptions: new Map(),
    _subscription: <Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject>(
      query: Query<Data, Variables, Extensions>,
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
