import type { ExecutionResult } from "graphql";
import nock from "nock";
import type { JsonObject, Promisable } from "type-fest";
import { expect, vi } from "vitest";
import { z } from "zod";
import type { App } from "../../src/services/app/app.js";
import type { Query } from "../../src/services/app/edit-graphql.js";
import { EditGraphQL } from "../../src/services/app/edit-graphql.js";
import { config } from "../../src/services/config/config.js";
import type { EditGraphQLError } from "../../src/services/error/error.js";
import { noop, unthunk } from "../../src/services/util/function.js";
import { loadCookie } from "../../src/services/util/http.js";
import { isFunction } from "../../src/services/util/is.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { testApp } from "./app.js";
import { log } from "./debug.js";

export const nockEditGraphQLResponse = <Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject>({
  query,
  app = testApp,
  ...opts
}: {
  query: Query<Data, Variables, Extensions>;
  expectVariables?: Variables | ((actual: any) => void);
  response:
    | ExecutionResult<Data, Extensions>
    | ((body: { query: Query<Data, Variables, Extensions>; variables?: Variables }) => Promisable<ExecutionResult<Data, Extensions>>);
  app?: App;
  persist?: boolean;
  optional?: boolean;
}): PromiseSignal => {
  let subdomain = app.slug;
  if (app.hasSplitEnvironments) {
    subdomain += "--development";
  }

  let expectVariables: (actual: any) => void;
  switch (true) {
    case isFunction(opts.expectVariables):
      expectVariables = opts.expectVariables;
      break;
    case opts.expectVariables === undefined:
      expectVariables = noop;
      break;
    default:
      expectVariables = (actual) => expect(actual).toEqual({ query, variables: opts.expectVariables });
      break;
  }

  const handledRequest = new PromiseSignal();

  nock(`https://${subdomain}.${config.domains.app}`)
    .post("/edit/api/graphql", (body) => body.query === query)
    .matchHeader("cookie", (cookie) => loadCookie() === cookie)
    .optionally(opts.optional)
    .reply(200, (_uri, rawBody) => {
      try {
        const body = z
          .object({
            query: z.literal(query),
            variables: z
              .record(z.unknown())
              .optional()
              .refine((variables) => {
                expectVariables(variables);
                return true;
              }),
          })
          .parse(rawBody) as { query: Query<Data, Variables, Extensions>; variables?: Variables };

        let response;
        if (isFunction(opts.response)) {
          response = opts.response(body);
        } else {
          response = opts.response;
        }

        handledRequest.resolve();

        return response;
      } catch (error) {
        log.error("failed to generate response", { error });
        handledRequest.reject(error);
        throw error;
      }
    })
    .persist(opts.persist);

  return handledRequest;
};

export type MockSubscription<
  Data extends JsonObject = JsonObject,
  Variables extends JsonObject = JsonObject,
  Extensions extends JsonObject = JsonObject,
> = {
  variables?: Variables | null;
  emitNext(value: ExecutionResult<Data, Extensions>): void;
  emitError(error: EditGraphQLError): void;
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
  vi.spyOn(EditGraphQL.prototype, "_subscribe").mockImplementation((options) => {
    options.onComplete ??= noop;

    vi.spyOn(options, "onResult");
    vi.spyOn(options, "onError");
    vi.spyOn(options, "onComplete");

    subscriptions.set(options.query, {
      variables: unthunk(options.variables),
      emitNext: options.onResult,
      emitError: options.onError,
      emitComplete: options.onComplete,
    });

    return vi.fn();
  });

  return mockEditGraphQL;
};
