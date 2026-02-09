// noinspection JSCommentMatchesSignature

import assert from "node:assert";
import type { Promisable } from "type-fest";
import type { Context } from "../../command/context.js";
import { type HttpOptions } from "../../http/http.js";
import { unthunk, type Thunk } from "../../util/function.js";
import { isStringArray } from "../../util/is.js";
import type { RetryOptions } from "../../util/retry.js";
import type { Environment } from "../app.js";
import { Client, type ClientSubscription } from "../client.js";
import { AuthenticationError, ClientError } from "../error.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "./operation.js";

export class Edit {
  /**
   * The {@linkcode Context} that was used to create this instance.
   */
  readonly ctx: Context;

  /**
   * The client used to make requests to Gadget's /edit/api/graphql
   * endpoint.
   */
  #client: Client;

  constructor(ctx: Context, environment: Environment) {
    this.ctx = ctx.child({ name: "edit" });
    this.#client = new Client(this.ctx, environment, "/edit/api/graphql");
  }

  /**
   * Execute a GraphQL query.
   *
   * @param request - The query and variables to send to the server.
   * @param request.query - The GraphQL query to execute.
   * @param request.variables - The variables to send to the server.
   * @param request.http - {@linkcode HttpOptions} to pass to http.
   * @returns The data returned by the server.
   */
  async query<Query extends GraphQLQuery>({
    query,
    variables,
    ...options
  }: {
    query: Query;
    variables?: Thunk<Query["Variables"]> | null;
    http?: HttpOptions;
  }): Promise<Query["Data"]> {
    const name = /query (\w+)/.exec(query)?.[1];
    assert(name, "query name not found");

    const ctx = this.ctx.child({
      name: "edit",
      fields: { edit: { query: name } },
      devFields: { edit: { query: name, variables: unthunk(variables) } },
    });

    ctx.log.info("executing graphql query");
    const response = await this.#client.execute(ctx, {
      operation: query,
      variables,
      ...options,
      http: {
        retry: {
          // queries _should_ be idempotent, so automatically retry them
          methods: ["POST"],
        },
        ...options.http,
      },
    });

    if (response.errors) {
      throw new ClientError(query, response.errors);
    }

    if (!response.data) {
      throw new ClientError(query, "Query response did not contain data");
    }

    return response.data;
  }

  /**
   * Execute a GraphQL mutation.
   *
   * @param request - The query and variables to send to the server.
   * @param request.mutation - The GraphQL mutation to execute.
   * @param request.variables - The variables to send to the server.
   * @param request.http - {@linkcode HttpOptions} to pass to http.
   * @returns The data returned by the server.
   */
  async mutate<Mutation extends GraphQLMutation>({
    mutation,
    variables,
    ...options
  }: {
    mutation: Mutation;
    variables?: Thunk<Mutation["Variables"]> | null;
    http?: HttpOptions;
  }): Promise<Mutation["Data"]> {
    const name = /mutation (\w+)/.exec(mutation)?.[1];
    assert(name, "mutation name not found");

    const ctx = this.ctx.child({
      name: "edit",
      fields: { edit: { mutation: name } },
      devFields: { edit: { mutation: name, variables: unthunk(variables) } },
    });

    ctx.log.info("executing graphql mutation");
    const response = await this.#client.execute(ctx, { operation: mutation, variables, ...options });

    if (response.errors) {
      /* If it is the specific unauthenticated error, handle it differently as nothing is broken in that case */
      if (isStringArray(response.errors) && response.errors[0] && response.errors[0] === "Unauthenticated. No authenticated client.") {
        throw new AuthenticationError(mutation);
      }
      throw new ClientError(mutation, response.errors);
    }

    if (!response.data) {
      throw new ClientError(mutation, "Mutation response did not contain data");
    }

    return response.data;
  }

  /**
   * Subscribe to a GraphQL subscription.
   *
   * @param options - The query and variables to send to the server.
   * @param options.subscription - The GraphQL subscription to subscribe to.
   * @param options.variables - The variables to send to the server.
   * @param options.onData - A callback that will be called when data is received from the server.
   * @param options.onError - A callback that will be called when an error is received from the server.
   * @param options.onComplete - A callback that will be called when the subscription ends.
   * @param options.retry - Optional retry configuration for automatic resubscription on transient errors.
   * @returns An EditSubscription object to control the subscription.
   */
  subscribe<Subscription extends GraphQLSubscription>({
    subscription,
    variables,
    onData,
    onError,
    onComplete,
    retry,
  }: {
    subscription: Subscription;
    variables?: Thunk<Subscription["Variables"]> | null;
    onData: (data: Subscription["Data"]) => Promisable<void>;
    onError: (error: ClientError) => Promisable<void>;
    onComplete?: () => Promisable<void>;
    retry?: RetryOptions;
  }): EditSubscription<Subscription> {
    const name = /subscription (\w+)/.exec(subscription)?.[1];
    assert(name, "subscription name not found");

    const ctx = this.ctx.child({
      name: "edit",
      fields: { edit: { subscription: name } },
      devFields: { edit: { subscription: name, variables: unthunk(variables) } },
    });

    ctx.log.info("subscribing to graphql subscription");

    const clientSubscription = this.#client.subscribe(ctx, {
      subscription,
      variables,
      onData,
      onError,
      onComplete,
      retry,
    });

    return clientSubscription;
  }

  /**
   * Close the client.
   */
  async dispose(): Promise<void> {
    await this.#client.dispose();
  }
}

/**
 * An object that can be used to unsubscribe and resubscribe to an
 * ongoing Edit GraphQL subscription.
 */
export type EditSubscription<Subscription extends GraphQLSubscription> = ClientSubscription<Subscription>;
