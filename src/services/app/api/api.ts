import assert from "node:assert";
import type { Context } from "../../command/context.js";
import type { HttpOptions } from "../../http/http.js";
import { unthunk, type Thunk } from "../../util/function.js";
import { Client } from "../client.js";
import type { GraphQLQuery } from "../edit/operation.js";
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
    const name = /query (\w+)/.exec(query)?.[1];
    assert(name, "query name not found");

    const ctx = this.ctx.child({
      name: "api",
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
   * Close the client.
   */
  async dispose(): Promise<void> {
    await this.#client.dispose();
  }
}
