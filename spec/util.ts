import nock from "nock";
import path from "node:path";
import type { JsonObject } from "type-fest";
import { assert, expect, vi, type Assertion } from "vitest";
import type { App } from "../src/services/app.js";
import { config } from "../src/services/config.js";
import type { Payload, Query, Sink } from "../src/services/edit-graphql.js";
import { EditGraphQL } from "../src/services/edit-graphql.js";
import { loadCookie } from "../src/services/http.js";
import { noop } from "../src/services/noop.js";
import { writeSession } from "../src/services/session.js";
import type { User } from "../src/services/user.js";

export const testDirPath = (): string => {
  const name = expect.getState().currentTestName;
  assert(name, "Expected test name to be defined");

  const [testFile, ...rest] = name.split(" > ");
  const describes = rest.length > 1 ? rest.slice(0, -1) : [];
  const testName = rest.at(-1);

  assert(testFile && testName);

  return path.join(__dirname, "../tmp/", testFile, describes.join("/"), testName.replace(/[^\s\w-]/g, ""));
};

export const fixturesDirPath = path.join(__dirname, "__fixtures__");

export const testUser: User = {
  id: 1,
  email: "test@example.com",
  name: "Jane Doe",
};

export const testApp: App = {
  id: 1,
  slug: "test",
  primaryDomain: "test.gadget.app",
  hasSplitEnvironments: true,
  user: testUser,
};

export const loginTestUser = (): void => {
  writeSession("test");
  const cookie = loadCookie();
  expect(cookie, "Cookie to be set after writing session").toBeTruthy();
  nock(`https://${config.domains.services}`).get("/auth/api/current-user").matchHeader("cookie", cookie!).reply(200, testUser);
};

export const testStdout: string[] = [];

export const expectStdout = (): Assertion<string> => expect(testStdout.join(""));

export const expectProcessExit = async (fnThatExits: () => unknown, expectedCode = 0): Promise<void> => {
  const exitError = new Error("process.exit() was called") as Error & { code?: number };
  vi.spyOn(process, "exit").mockImplementationOnce((exitCode) => {
    exitError.code = exitCode;
    throw exitError;
  });

  try {
    await fnThatExits();
    expect.fail("Expected process.exit() to be called");
  } catch (error) {
    expect(error).toBe(exitError);
    expect(exitError.code).toBe(expectedCode);
  }
};

export const expectError = async (fnThatThrows: () => unknown): Promise<any> => {
  try {
    await fnThatThrows();
    expect.fail("Expected error to be thrown");
  } catch (error) {
    return error;
  }
};

export type MockSubscription<Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject> = {
  sink: Sink<Data, Extensions>;
  payload: Payload<Data, Variables>;
  unsubscribe: () => void;
};

export type MockEditGraphQL = {
  _subscriptions: Map<string, MockSubscription<JsonObject, JsonObject, JsonObject>>;
  _subscription<Data extends JsonObject, Variables extends JsonObject>(
    query: Query<Data, Variables>,
  ): MockSubscription<Data, Variables, JsonObject>;
} & EditGraphQL;

export const mockEditGraphQL = (): MockEditGraphQL => {
  const mock = {
    ...EditGraphQL.prototype,
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

  vi.spyOn(EditGraphQL.prototype, "dispose");
  vi.spyOn(EditGraphQL.prototype, "_subscribe").mockImplementation((payload, sink) => {
    if (!sink.complete) {
      sink.complete = noop;
    }

    const unsubscribe = vi.fn();
    vi.spyOn(sink, "next");
    vi.spyOn(sink, "error");
    vi.spyOn(sink, "complete");
    mock._subscriptions.set(payload.query, { payload, sink, unsubscribe });
    return unsubscribe;
  });

  return mock as MockEditGraphQL;
};
