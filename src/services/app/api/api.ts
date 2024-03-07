import type { ExecutionResult } from "graphql-ws";
import assert from "node:assert";
import type { Promisable } from "type-fest";
import type { Context } from "../../command/context.js";
import type { HttpOptions } from "../../http/http.js";
import { unthunk, type Thunk } from "../../util/function.js";
import { Client } from "../client.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "../edit/operation.js";
import { ClientError } from "../error.js";

export class Api {
  /**
   * The {@linkcode Context} that was used to create this instance.
   */
  readonly ctx: Context;

  /**
   * The client used to make requests to Gadget's /api/graphql
   * endpoint.
   */
  #client: Client;

  constructor(ctx: Context) {
    this.ctx = ctx.child({ name: "api" });
    this.#client = new Client(this.ctx, "/api/graphql");
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
    const name = query.match(/query (\w+)/)?.[1];
    assert(name, "query name not found");

    const ctx = this.ctx.child({
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
    const name = mutation.match(/mutation (\w+)/)?.[1];
    assert(name, "mutation name not found");

    const ctx = this.ctx.child({
      fields: { edit: { mutation: name } },
      devFields: { edit: { mutation: name, variables: unthunk(variables) } },
    });

    ctx.log.info("executing graphql mutation");
    const response = await this.#client.execute(ctx, { operation: mutation, variables, ...options });

    if (response.errors) {
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
   * @returns A function to unsubscribe from the subscription.
   */
  subscribe<Subscription extends GraphQLSubscription>({
    onData,
    ...options
  }: {
    subscription: Subscription;
    variables?: Thunk<Subscription["Variables"]> | null;
    onData: (data: Subscription["Data"]) => Promisable<void>;
    onError: (error: ClientError) => Promisable<void>;
    onComplete?: () => Promisable<void>;
  }): EditSubscription<Subscription> {
    const name = options.subscription.match(/subscription (\w+)/)?.[1];
    assert(name, "subscription name not found");

    let ctx = this.ctx.child({
      fields: { edit: { subscription: name } },
      devFields: { edit: { subscription: name, variables: unthunk(options.variables) } },
    });

    const onResponse = async (response: ExecutionResult<Subscription["Data"], Subscription["Extensions"]>): Promise<void> => {
      if (response.errors) {
        unsubscribe();
        await options.onError(new ClientError(options.subscription, response.errors));
        return;
      }

      if (!response.data) {
        unsubscribe();
        await options.onError(new ClientError(options.subscription, "Subscription response did not contain data"));
        return;
      }

      await onData(response.data);
    };

    ctx.log.info("subscribing to graphql subscription");
    let unsubscribe = this.#client.subscribe(ctx, { ...options, onResponse });

    return {
      unsubscribe,
      resubscribe: (variables) => {
        unsubscribe();

        if (variables !== undefined) {
          options.variables = variables;
        }

        ctx = this.ctx.child({
          fields: { edit: { subscription: name } },
          devFields: { edit: { subscription: name, variables: unthunk(options.variables) } },
        });

        ctx.log.info("re-subscribing to graphql subscription");
        unsubscribe = this.#client.subscribe(ctx, { ...options, onResponse });
      },
    };
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
export type EditSubscription<Subscription extends GraphQLSubscription> = {
  /**
   * Unsubscribe from the subscription.
   */
  unsubscribe(): void;

  /**
   * Resubscribe to the subscription.
   */
  resubscribe(variables?: Thunk<Subscription["Variables"]> | null): void;
};
