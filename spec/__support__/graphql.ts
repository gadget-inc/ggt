import { http } from "msw";
import type { Promisable } from "type-fest";
import { expect, vi } from "vitest";
import { ZodSchema, z } from "zod";
import type { Application, Environment } from "../../src/services/app/app.js";
import { Client } from "../../src/services/app/client.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "../../src/services/app/edit/operation.js";
import type { ClientError } from "../../src/services/app/error.js";
import { config } from "../../src/services/config/config.js";
import { loadCookie } from "../../src/services/http/auth.js";
import { readToken } from "../../src/services/user/session.js";
import { noop, unthunk, type Thunk } from "../../src/services/util/function.js";
import { isFunction } from "../../src/services/util/is.js";
import { PromiseSignal } from "../../src/services/util/promise.js";
import { testEnvironment } from "./app.js";
import { testCtx } from "./context.js";
import { log } from "./debug.js";
import { mock } from "./mock.js";
import { mockServer } from "./msw.js";

export type MockGraphQLResponseOptions<Operation extends GraphQLQuery | GraphQLMutation> = {
  /**
   * The GraphQL operation to mock.
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
 * @see {@linkcode MockGraphQLResponseOptions}
 */
export const mockGraphQLResponse = <Query extends GraphQLQuery | GraphQLMutation>({
  operation,
  environment = testEnvironment,
  application = environment.application,
  optional: _optional = false,
  persist = false,
  times = 1,
  statusCode = 200,
  endpoint,
  ...opts
}: MockGraphQLResponseOptions<Query> & { endpoint: string }): { responded: PromiseSignal; isDone: () => boolean } => {
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
  let callCount = 0;
  const expectedCalls = persist ? Infinity : times;

  const handler = http.post(`https://${subdomain}.${config.domains.app}${endpoint}`, async ({ request }) => {
    try {
      // Clone the request so we can read the body without consuming it for other handlers
      const clonedRequest = request.clone();

      // Parse the request body first without strict validation
      const rawBody = await clonedRequest.json();
      const parsedBody = z.object({ query: z.string(), variables: z.record(z.unknown()).optional() }).parse(rawBody);

      // Check if the query matches this handler's operation
      if (parsedBody.query !== operation) {
        // Not this handler's query, pass through to next handler
        return;
      }

      // Check if we've reached the call limit
      if (!persist && callCount >= times) {
        // This handler has been called enough times, pass through to next handler
        return;
      }
      callCount++;

      // Validate auth headers
      const token = readToken(testCtx);
      const cookie = loadCookie(testCtx);
      const authHeader = request.headers.get("x-platform-access-token");
      const cookieHeader = request.headers.get("cookie");

      if (token && authHeader !== token) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (cookie && cookieHeader !== cookie) {
        return new Response("Unauthorized", { status: 401 });
      }

      // Check environment header
      const envHeader = request.headers.get("x-gadget-environment");
      if (envHeader && envHeader !== environment.name) {
        // Environment header present but doesn't match, pass through
        return;
      }

      // Validate and generate response
      const variables = expectVariables(parsedBody.variables);
      let response;

      try {
        response = await generateResponse(variables);
      } catch (error) {
        // If the response function throws an error, convert it to a GraphQL error response
        // This allows tests to simulate server-side errors by throwing in the response function
        log.error("response function threw error, converting to graphql error", { error });
        const errorMessage = error instanceof Error ? error.message : String(error);
        response = {
          errors: [{ message: errorMessage }],
        };
      }

      responded.resolve();

      // Serialize the response properly, especially GraphQLError objects
      const serializedResponse = JSON.parse(JSON.stringify(response));

      return Response.json(serializedResponse, { status: statusCode });
    } catch (error) {
      log.error("failed to handle graphql request", { error });
      throw error;
    }
  });

  mockServer.use(handler);

  return {
    responded,
    isDone: () => callCount >= expectedCalls,
  };
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

export const mockEditResponse = <Query extends GraphQLQuery | GraphQLMutation>({
  ...options
}: MockGraphQLResponseOptions<Query>): ReturnType<typeof mockGraphQLResponse> => {
  return mockGraphQLResponse({ ...options, endpoint: "/edit/api/graphql" });
};

export const mockApiResponse = <Query extends GraphQLQuery | GraphQLMutation>({
  ...options
}: MockGraphQLResponseOptions<Query>): ReturnType<typeof mockGraphQLResponse> => {
  return mockGraphQLResponse({ ...options, endpoint: "/api/graphql" });
};

export type mockGraphQLResponseOptions<Operation extends GraphQLQuery | GraphQLMutation> = MockGraphQLResponseOptions<Operation>;
