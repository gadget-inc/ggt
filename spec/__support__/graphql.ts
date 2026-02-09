import nock, { type Scope } from "nock";
import type { Promisable } from "type-fest";
import { expect, vi } from "vitest";
import { z } from "zod";
import type { Application, Environment } from "../../src/services/app/app.js";
import { Client } from "../../src/services/app/client.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "../../src/services/app/edit/operation.js";
import type { ClientError } from "../../src/services/app/error.js";
import { ClientError as ClientErrorClass } from "../../src/services/app/error.js";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";
import { noop, unthunk, type Thunk } from "../../src/services/util/function.js";
import { isFunction } from "../../src/services/util/is.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { calculateBackoffDelay, DEFAULT_RETRY_LIMIT, isRetryableErrorCause } from "../../src/services/util/retry.js";
import { testEnvironment } from "./app.js";
import { testCtx } from "./context.js";
import { log } from "./debug.js";
import { mock } from "./mock.js";
import { matchAuthHeader } from "./user.js";

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
  expectVariables?: Thunk<Operation["Variables"] | z.ZodType> | null;

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
  if (environment.type !== "production") {
    subdomain += `--${environment.name}`;
  }

  const expectVariables = (actual: unknown): Query["Variables"] => {
    const expected = unthunk(opts.expectVariables);
    if (expected instanceof z.ZodType) {
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

  const scope = matchAuthHeader(
    nock(`https://${subdomain}.${config.domains.app}`)
      .post(endpoint, (body) => body.query === operation)
      .matchHeader("cookie", (cookie) => loadCookie(testCtx) === cookie)
      .matchHeader("x-gadget-environment", environment.name)
      .optionally(optional)
      .times(times)
      .reply(statusCode, async (_uri, rawBody) => {
        try {
          const body = z.object({ query: z.literal(operation), variables: z.record(z.string(), z.unknown()).optional() }).parse(rawBody);
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
      .persist(persist),
  ) as ReturnType<typeof nockGraphQLResponse>;

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
   * the subscription (returns the most recent subscription).
   *
   * @param subscription - The query to expect.
   */
  expectSubscription<Subscription extends GraphQLSubscription>(subscription: Subscription): MockEditSubscription<Subscription>;

  /**
   * Returns all subscriptions that have been made for the given query,
   * in order of creation. Useful for testing resubscription behavior.
   *
   * @param subscription - The query to get subscriptions for.
   */
  getAllSubscriptions<Subscription extends GraphQLSubscription>(subscription: Subscription): MockEditSubscription<Subscription>[];
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
  const subscriptions = new Map<GraphQLSubscription, MockEditSubscription[]>();

  const mockEditSubscriptions: MockEditSubscriptions = {
    expectSubscription: (query) => {
      const subs = subscriptions.get(query);
      expect(subs).toBeDefined();
      expect(subs!.length).toBeGreaterThan(0);
      // Return the most recent subscription
      // oxlint-disable-next-line no-unsafe-return
      return subs![subs!.length - 1] as any;
    },
    getAllSubscriptions: (query) => {
      // oxlint-disable-next-line no-unsafe-return
      return (subscriptions.get(query) ?? []) as any;
    },
  };

  vi.spyOn(Client.prototype, "dispose");
  mock(Client.prototype, "subscribe", (_ctx, options) => {
    options.onComplete ??= noop;

    vi.spyOn(options, "onData");
    vi.spyOn(options, "onError");
    vi.spyOn(options, "onComplete");

    // Retry state - mirrors the retry logic in Client.subscribe.
    // This duplication is intentional: the mock needs to simulate retry
    // behavior without the full graphql-ws Client infrastructure.
    const maxRetries = options.retry?.maxAttempts ?? DEFAULT_RETRY_LIMIT;
    let retryCount = 0;
    let retryTimeoutId: NodeJS.Timeout | undefined;

    /**
     * Schedule a retry attempt with exponential backoff.
     * Returns true if retry was scheduled, false if retry budget exhausted.
     */
    const scheduleRetry = (error: ClientError): boolean => {
      if (!options.retry || !isRetryableErrorCause(error.cause) || retryCount >= maxRetries) {
        return false;
      }

      // Only increment retryCount if no retry is already pending.
      if (!retryTimeoutId) {
        retryCount++;
      }
      const delay = calculateBackoffDelay(retryCount);

      options.retry.onRetry?.(retryCount, error);

      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
      retryTimeoutId = setTimeout(() => {
        retryTimeoutId = undefined;
        clientSubscription.resubscribe();
      }, delay);

      return true;
    };

    const createMockSubscription = (variables: MockEditSubscription["variables"]): MockEditSubscription => ({
      variables,
      emitResponse: async (response) => {
        if (response.errors) {
          const error = new ClientErrorClass(options.subscription, response.errors);
          if (scheduleRetry(error)) {
            return;
          }
          await options.onError(error);
          return;
        }

        if (!response.data) {
          const error = new ClientErrorClass(options.subscription, "Subscription response did not contain data");
          await options.onError(error);
          return;
        }

        // Reset retry count on successful data
        if (retryCount > 0) {
          if (retryTimeoutId) {
            clearTimeout(retryTimeoutId);
            retryTimeoutId = undefined;
          }
          retryCount = 0;
        }

        await options.onData(response.data);
      },
      emitError: async (error) => {
        if (scheduleRetry(error)) {
          return;
        }
        await options.onError(error);
      },
      emitComplete: async () => {
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = undefined;
        }
        await options.onComplete!();
      },
    });

    const initialVariables = unthunk(options.variables);
    let currentMockSub = createMockSubscription(initialVariables);
    const existing = subscriptions.get(options.subscription) ?? [];
    existing.push(currentMockSub);
    subscriptions.set(options.subscription, existing);

    // Return a ClientSubscription object with working resubscribe
    const clientSubscription = {
      unsubscribe: vi.fn().mockImplementation(() => {
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = undefined;
        }
      }),
      // oxlint-disable-next-line no-redundant-type-constituents -- matches Client.subscribe API signature
      resubscribe: vi.fn().mockImplementation((newVariables?: Thunk<unknown> | null) => {
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = undefined;
        }

        if (newVariables !== undefined) {
          options.variables = newVariables as typeof options.variables;
        }

        const variables = unthunk(options.variables);
        currentMockSub = createMockSubscription(variables);
        const subs = subscriptions.get(options.subscription) ?? [];
        subs.push(currentMockSub);
        subscriptions.set(options.subscription, subs);
      }),
    };

    return clientSubscription;
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
