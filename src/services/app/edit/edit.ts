import type { Promisable } from "type-fest";
import type { Context } from "../../command/context.js";
import { type HttpOptions } from "../../http/http.js";
import { unthunk, type Thunk } from "../../util/function.js";
import { Client } from "./client.js";
import { EditError } from "./error.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "./operation.js";

export class Edit {
  readonly ctx: Context;
  #client: Client;

  constructor(ctx: Context) {
    this.ctx = ctx.child({ name: "edit" });
    this.#client = new Client(this.ctx);
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
    const name = query.split(/ |\(/, 2)[1];
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
      throw new EditError(query, response.errors);
    }

    if (!response.data) {
      throw new EditError(query, "Query response did not contain data");
    }

    return response.data;
  }

  /**
   * Execute a GraphQL mutation.
   *
   * @param request - The query and variables to send to the server.
   * @param request.mutation - The GraphQL query to execute.
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
    const name = mutation.split(/ |\(/, 2)[1];
    const ctx = this.ctx.child({
      fields: { edit: { mutation: name } },
      devFields: { edit: { mutation: name, variables: unthunk(variables) } },
    });

    ctx.log.info("executing graphql mutation");
    const response = await this.#client.execute(ctx, { operation: mutation, variables, ...options });

    if (response.errors) {
      throw new EditError(mutation, response.errors);
    }

    if (!response.data) {
      throw new EditError(mutation, "Mutation response did not contain data");
    }

    return response.data;
  }

  /**
   * Subscribe to a GraphQL subscription.
   *
   * @param options - The query and variables to send to the server.
   * @param options.subscription - The GraphQL subscription to subscribe to.
   * @param options.variables - The variables to send to the server.
   * @param options.onData - A callback that will be called with the data returned by the server.
   * @param options.onError - A callback that will be called with any errors returned by the server.
   * @param options.onComplete - A callback that will be called when the subscription is complete.
   * @returns A function to unsubscribe from the subscription.
   */
  subscribe<Subscription extends GraphQLSubscription>({
    onData,
    ...options
  }: {
    subscription: Subscription;
    variables?: Thunk<Subscription["Variables"]> | null;
    onData: (data: Subscription["Data"]) => Promisable<void>;
    onError: (error: EditError) => Promisable<void>;
    onComplete?: () => Promisable<void>;
  }): () => void {
    const name = options.subscription.split(/ |\(/, 2)[1];
    const ctx = this.ctx.child({
      fields: { edit: { subscription: name } },
      devFields: { edit: { subscription: name, variables: unthunk(options.variables) } },
    });

    ctx.log.info("subscribing to graphql subscription");
    const unsubscribe = this.#client.subscribe(ctx, {
      ...options,
      onResponse: async (response) => {
        if (response.errors) {
          unsubscribe();
          await options.onError(new EditError(options.subscription, response.errors));
          return;
        }

        if (!response.data) {
          unsubscribe();
          await options.onError(new EditError(options.subscription, "Subscription response did not contain data"));
          return;
        }

        await onData(response.data);
      },
    });

    return unsubscribe;
  }

  /**
   * Close the client.
   */
  async dispose(): Promise<void> {
    await this.#client.dispose();
  }
}
