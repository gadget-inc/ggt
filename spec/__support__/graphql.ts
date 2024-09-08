import nock, { type Scope } from "nock";
import type { Promisable } from "type-fest";
import { expect, vi } from "vitest";
import { ZodSchema, z } from "zod";
import type { Application, Environment } from "../../src/services/app/app.js";
import { Client } from "../../src/services/app/client.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "../../src/services/app/edit/operation.js";
import type { ClientError } from "../../src/services/app/error.js";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";
import { noop, unthunk, type Thunk } from "../../src/services/util/function.js";
import { isFunction } from "../../src/services/util/is.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { testEnvironment } from "./app.js";
import { testCtx } from "./context.js";
import { log } from "./debug.js";
import { mock } from "./mock.js";

export type NockGraphQLResponseOptions<Operation extends GraphQLQuery | GraphQLMutation> = {
  /**
   * The GraphQL operation to nock.
   */
  operation: Operation;

  /**
   * The response to respond with.
   *
   * If a function is provided, it will be called with the variables
   * from the request.
   */
  response: Operation["Response"] | ((variables: Operation["Variables"]) => Promisable<Operation["Response"]>);

  /**
   * The variables to expect in the request.
   */
  expectVariables?: Thunk<Operation["Variables"] | ZodSchema> | null;

  /**
   * The app to respond to.
   *
   * @default testEnvironment.application
   */
  application?: Application;

  /**
   * The environment to respond to.
   *
   * @default testEnvironment
   */
  environment?: Environment;

  /**
   * Whether to keep responding to requests after the first one.
   *
   * @default false
   */
  persist?: boolean;

  /**
   * Whether the request has to be made.
   *
   * @default true
   */
  optional?: boolean;

  /**
   * The number of times to respond to the request.
   *
   * @default 1
   */
  times?: number;

  /**
   * The status code to respond with.
   *
   * @default 200
   */
  statusCode?: number;
};

/**
 * Sets up a response to an {@linkcode Edit} query or mutation.
 *
 * @see {@linkcode NockGraphQLResponseOptions}
 */
export const nockGraphQLResponse = <Query extends GraphQLQuery | GraphQLMutation>({
  operation,
  environment = testEnvironment,
  application = environment.application,
  optional = false,
  persist = false,
  times = 1,
  statusCode = 200,
  endpoint,
  ...opts
}: NockGraphQLResponseOptions<Query> & { endpoint: string }): Scope & { responded: PromiseSignal } => {
  let subdomain = application.slug;
  if (application.multiEnvironmentEnabled) {
    subdomain += `--${environment.name}`;
  } else if (application.hasSplitEnvironments) {
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

  const generateResponse = (variables: Query["Variables"]): Promisable<Query["Response"]> => {
    if (isFunction(opts.response)) {
      return opts.response(variables);
    } else {
      return opts.response;
    }
  };

  const responded = new PromiseSignal();

  const scope = nock(`https://${subdomain}.${config.domains.app}`)
    .post(endpoint, (body) => body.query === operation)
    .matchHeader("cookie", (cookie) => loadCookie(testCtx) === cookie)
    .matchHeader("x-gadget-environment", environment.name)
    .optionally(optional)
    .times(times)
    .reply(statusCode, async (_uri, rawBody) => {
      try {
        const body = z.object({ query: z.literal(operation), variables: z.record(z.unknown()).optional() }).parse(rawBody);
        const variables = expectVariables(body.variables);
        const response = await generateResponse(variables);
        return response;
      } catch (error) {
        log.error("failed to generate response", { error });
        throw error;
      } finally {
        responded.resolve();
      }
    })
    .persist(persist) as ReturnType<typeof nockGraphQLResponse>;
  scope.responded = responded;

  return scope;
};

/**
 * An object that can be used to mock {@linkcode Edit} subscriptions.
 *
 * @see {@linkcode makeMockEditSubscriptions}
 */
export type MockEditSubscriptions = {
  /**
   * Asserts that a subscription has been made for the given query and
   * returns an object that can be used to emit responses and errors to
   * the subscription.
   *
   * @param subscription - The query to expect.
   */
  expectSubscription<Subscription extends GraphQLSubscription>(subscription: Subscription): MockEditSubscription<Subscription>;
};

/**
 * An object that can be used to emit responses and errors to an
 * Edit GraphQL subscription.
 */
export type MockEditSubscription<Query extends GraphQLSubscription = GraphQLSubscription> = {
  /**
   * The variables that were used to start the subscription.
   */
  variables?: Query["Variables"] | null;

  /**
   * Emits a response to the subscription.
   */
  emitResponse(value: Query["Response"]): Promisable<void>;

  /**
   * Emits an error to the subscription.
   */
  emitError(error: ClientError): Promisable<void>;

  /**
   * Emits the onComplete event to the subscription.
   */
  emitComplete(): Promisable<void>;
};

export const makeMockEditSubscriptions = (): MockEditSubscriptions => {
  const subscriptions = new Map<GraphQLSubscription, MockEditSubscription>();

  const mockEditSubscriptions: MockEditSubscriptions = {
    expectSubscription: (query) => {
      expect(Array.from(subscriptions.keys())).toContain(query);
      const sub = subscriptions.get(query);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return sub as any;
    },
  };

  vi.spyOn(Client.prototype, "dispose");
  mock(Client.prototype, "subscribe", (_ctx, options) => {
    options.onComplete ??= noop;

    vi.spyOn(options, "onResponse");
    vi.spyOn(options, "onError");
    vi.spyOn(options, "onComplete");

    const variables = unthunk(options.variables);

    subscriptions.set(options.subscription, {
      variables,
      emitResponse: options.onResponse,
      emitError: options.onError,
      emitComplete: options.onComplete,
    });

    return vi.fn();
  });

  return mockEditSubscriptions;
};

export const nockEditResponse = <Query extends GraphQLQuery | GraphQLMutation>({
  ...options
}: NockGraphQLResponseOptions<Query>): ReturnType<typeof nockGraphQLResponse> => {
  return nockGraphQLResponse({ ...options, endpoint: "/edit/api/graphql" });
};

export const nockApiResponse = <Query extends GraphQLQuery | GraphQLMutation>({
  ...options
}: NockGraphQLResponseOptions<Query>): ReturnType<typeof nockGraphQLResponse> => {
  return nockGraphQLResponse({ ...options, endpoint: "/api/graphql" });
};
