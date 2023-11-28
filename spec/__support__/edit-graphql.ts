import type { ExecutionResult } from "graphql";
import nock from "nock";
import type { JsonObject } from "type-fest";
import { expect, vi } from "vitest";
import type { App } from "../../src/services/app/app.js";
import type { Payload, Query } from "../../src/services/app/edit-graphql.js";
import { EditGraphQL } from "../../src/services/app/edit-graphql.js";
import { config } from "../../src/services/config/config.js";
import type { ClientError } from "../../src/services/error/error.js";
import { noop } from "../../src/services/util/function.js";
import { loadCookie } from "../../src/services/util/http.js";
import { isFunction } from "../../src/services/util/is.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { testApp } from "./app.js";

export const nockEditGraphQLResponse = <Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject>({
  query,
  response,
  expectVariables,
  app = testApp,
}: {
  query: Query<Data, Variables, Extensions>;
  response: ExecutionResult<Data, Extensions>;
  expectVariables?: Variables | ((actual: any) => void);
  app?: App;
}): PromiseSignal => {
  let subdomain = app.slug;
  if (app.hasSplitEnvironments) {
    subdomain += "--development";
  }

  const receivedRequest = new PromiseSignal();

  nock(`https://${subdomain}.${config.domains.app}`)
    .post("/edit/api/graphql", (body) => {
      try {
        if (isFunction(expectVariables)) {
          expectVariables(body.variables);
        } else {
          expect(body).toEqual({ query, variables: expectVariables });
        }
        receivedRequest.resolve();
        return true;
      } catch (error) {
        receivedRequest.reject(error);
        return false;
      }
    })
    .matchHeader("cookie", (value) => {
      const cookie = loadCookie();
      expect(cookie).toBeTruthy();
      return value === cookie;
    })
    .reply(200, response);

  return receivedRequest;
};

export type MockSubscription<
  Data extends JsonObject = JsonObject,
  Variables extends JsonObject = JsonObject,
  Extensions extends JsonObject = JsonObject,
> = {
  payload: Payload<Data, Variables>;
  emitNext(value: ExecutionResult<Data, Extensions>): void;
  emitError(error: ClientError): void;
  emitComplete(): void;
};

export type MockEditGraphQL = {
  expectSubscription<Data extends JsonObject, Variables extends JsonObject>(
    query: Query<Data, Variables>,
  ): MockSubscription<Data, Variables>;
};

export const createMockEditGraphQL = (): MockEditGraphQL => {
  const subscriptions = new Map<string, MockSubscription>();

  const mockEditGraphQL: MockEditGraphQL = {
    expectSubscription: (query) => {
      expect(Array.from(subscriptions.keys())).toContain(query);
      const sub = subscriptions.get(query);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return sub as any;
    },
  };

  vi.spyOn(EditGraphQL.prototype, "dispose");
  vi.spyOn(EditGraphQL.prototype, "_subscribe").mockImplementation((payload, callbacks) => {
    callbacks.complete ??= noop;

    vi.spyOn(callbacks, "next");
    vi.spyOn(callbacks, "error");
    vi.spyOn(callbacks, "complete");

    subscriptions.set(payload.query, {
      payload,
      emitNext: callbacks.next,
      emitError: callbacks.error,
      emitComplete: callbacks.complete,
    });

    return vi.fn();
  });

  return mockEditGraphQL;
};
