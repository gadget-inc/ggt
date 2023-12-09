import nock from "nock";
import type { Promisable } from "type-fest";
import { expect, vi } from "vitest";
import { ZodSchema, z } from "zod";
import type { App } from "../../src/services/app/app.js";
import type { EditGraphQLError, GraphQLQuery } from "../../src/services/app/edit-graphql.js";
import { EditGraphQL } from "../../src/services/app/edit-graphql.js";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";
import { noop, unthunk, type Thunk } from "../../src/services/util/function.js";
import { isFunction } from "../../src/services/util/is.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { testApp } from "./app.js";
import { log } from "./debug.js";

export type NockEditGraphQLResponseOptions<Query extends GraphQLQuery> = {
  /**
   * The query to respond to.
   */
  query: Query;

  /**
   * The result to respond with. If a function is provided, it will be
   * called with the variables from the request.
   */
  result: Query["Result"] | ((variables: Query["Variables"]) => Promisable<Query["Result"]>);

  /**
   * The variables to expect in the request.
   */
  expectVariables?: Thunk<Query["Variables"] | ZodSchema> | null;

  /**
   * The app to respond to.
   * @default testApp
   */
  app?: App;

  /**
   * Whether to keep responding to requests after the first one.
   * @default false
   */
  persist?: boolean;

  /**
   * Whether the request has to be made.
   * @default true
   */
  optional?: boolean;
};

/**
 * Sets up a response to an {@linkcode EditGraphQL} query.
 */
export const nockEditGraphQLResponse = <Query extends GraphQLQuery>({
  query,
  app = testApp,
  optional = false,
  persist = false,
  ...opts
}: NockEditGraphQLResponseOptions<Query>): PromiseSignal => {
  let subdomain = app.slug;
  if (app.hasSplitEnvironments) {
    subdomain += "--development";
  }

  const expectVariables = (actual: unknown): Query["Variables"] => {
    const expected = unthunk(opts.expectVariables);
    if (expected instanceof ZodSchema) {
      return expected.parse(actual) as Query["Variables"];
    } else {
      expect(actual).toEqual(expected);
      return actual as Query["Variables"];
    }
  };

  const generateResult = (variables: Query["Variables"]): Promisable<Query["Result"]> => {
    if (isFunction(opts.result)) {
      return opts.result(variables);
    } else {
      return opts.result;
    }
  };

  const responded = new PromiseSignal();

  nock(`https://${subdomain}.${config.domains.app}`)
    .post("/edit/api/graphql", (body) => body.query === query)
    .matchHeader("cookie", (cookie) => loadCookie() === cookie)
    .optionally(optional)
    .reply(200, async (_uri, rawBody) => {
      try {
        const body = z.object({ query: z.literal(query), variables: z.record(z.unknown()).optional() }).parse(rawBody);
        const variables = expectVariables(body.variables);
        const result = await generateResult(variables);
        return result;
      } catch (error) {
        log.error("failed to generate response", { error });
        throw error;
      } finally {
        responded.resolve();
      }
    })
    .persist(persist);

  return responded;
};

/**
 * An object that can be used to mock {@linkcode EditGraphQL} subscriptions.
 *
 * @see {@linkcode makeMockEditGraphQLSubscriptions}
 */
export type MockEditGraphQLSubscriptions = {
  /**
   * Asserts that a subscription has been made for the given query and
   * returns an object that can be used to emit results and errors to
   * the subscription.
   *
   * @param query The query to expect.
   */
  expectSubscription<Query extends GraphQLQuery>(query: Query): MockEditGraphQLSubscription<Query>;

  /**
   * Mocks the initial result when the given query is subscribed to.
   *
   * @param query The query to mock the initial result for.
   * @param result The result to mock.
   */
  mockInitialResult<Query extends GraphQLQuery>(
    query: Query,
    result: Query["Result"] | ((variables: Query["Variables"]) => Promisable<Query["Result"]>),
  ): void;
};

/**
 * An object that can be used to emit results and errors to an
 * EditGraphQL subscription.
 */
export type MockEditGraphQLSubscription<Query extends GraphQLQuery = GraphQLQuery> = {
  /**
   * The variables that were used to start the subscription.
   */
  variables?: Query["Variables"] | null;

  /**
   * Emits a result to the subscription.
   */
  emitResult(value: Query["Result"]): void;

  /**
   * Emits an error to the subscription.
   */
  emitError(error: EditGraphQLError): void;

  /**
   * Emits the onComplete event to the subscription.
   */
  emitComplete(): void;
};

export const makeMockEditGraphQLSubscriptions = (): MockEditGraphQLSubscriptions => {
  const subscriptions = new Map<GraphQLQuery, MockEditGraphQLSubscription>();
  const initialResults = new Map<
    GraphQLQuery,
    GraphQLQuery["Result"] | ((variables: GraphQLQuery["Variables"]) => Promisable<GraphQLQuery["Result"]>)
  >();

  const mockEditGraphQL: MockEditGraphQLSubscriptions = {
    expectSubscription: (query) => {
      expect(Array.from(subscriptions.keys())).toContain(query);
      const sub = subscriptions.get(query);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return sub as any;
    },
    mockInitialResult: (query, result) => {
      initialResults.set(query, result);
    },
  };

  vi.spyOn(EditGraphQL.prototype, "dispose");
  vi.spyOn(EditGraphQL.prototype, "_subscribe").mockImplementation((options) => {
    options.onComplete ??= noop;

    vi.spyOn(options, "onResult");
    vi.spyOn(options, "onError");
    vi.spyOn(options, "onComplete");

    const variables = unthunk(options.variables);

    subscriptions.set(options.query, {
      variables,
      emitResult: options.onResult,
      emitError: options.onError,
      emitComplete: options.onComplete,
    });

    const initialResult = initialResults.get(options.query);
    if (initialResult) {
      let getInitialResult: () => Promise<GraphQLQuery["Result"]>;
      if (isFunction(initialResult)) {
        getInitialResult = async () => initialResult(variables ?? {});
      } else {
        getInitialResult = () => Promise.resolve(initialResult);
      }

      // mimic network delay
      setTimeout(() => {
        void getInitialResult()
          .then((result) => options.onResult(result))
          .catch((error) => options.onError(error));
      }, 1);
    }

    return vi.fn();
  });

  return mockEditGraphQL;
};
