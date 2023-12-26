import type { ExecutionResult } from "graphql-ws";
import { createClient } from "graphql-ws";
import assert from "node:assert";
import type { ClientRequestArgs } from "node:http";
import PQueue from "p-queue";
import type { Promisable } from "type-fest";
import WebSocket from "ws";
import type { Context } from "../../command/context.js";
import { config } from "../../config/config.js";
import { loadCookie } from "../../http/auth.js";
import { http, type HttpOptions } from "../../http/http.js";
import { noop, unthunk, type Thunk } from "../../util/function.js";
import { isObject } from "../../util/is.js";
import { EditError } from "./error.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "./operation.js";

enum ConnectionStatus {
  CONNECTED,
  DISCONNECTED,
  RECONNECTING,
}

/**
 * Client is a GraphQL client connected to a Gadget application's
 * /edit/api/graphql endpoint.
 */
export class Client {
  // assume the client is going to connect
  status = ConnectionStatus.CONNECTED;

  readonly ctx: Context;

  private _graphqlWsClient: ReturnType<typeof createClient>;

  constructor(ctx: Context) {
    this.ctx = ctx.child({ name: "client" });
    assert(ctx.app, "missing app when creating edit client");

    let subdomain = ctx.app.slug;
    if (ctx.app.hasSplitEnvironments) {
      subdomain += "--development";
    }

    this._graphqlWsClient = createClient({
      url: `wss://${subdomain}.${config.domains.app}/edit/api/graphql-ws`,
      shouldRetry: () => true,
      webSocketImpl: class extends WebSocket {
        constructor(address: string | URL, protocols?: string | string[], wsOptions?: WebSocket.ClientOptions | ClientRequestArgs) {
          // this cookie should be available since we were given an app which requires a cookie to load
          const cookie = loadCookie();
          assert(cookie, "missing cookie when connecting to GraphQL API");

          super(address, protocols, {
            signal: ctx.signal,
            ...wsOptions,
            headers: {
              ...wsOptions?.headers,
              "user-agent": config.versionFull,
              cookie,
            },
          });
        }
      },
      on: {
        connecting: () => {
          switch (this.status) {
            case ConnectionStatus.DISCONNECTED:
              this.status = ConnectionStatus.RECONNECTING;
              this.ctx.log.info("reconnecting");
              break;
            case ConnectionStatus.RECONNECTING:
              this.ctx.log.info("retrying");
              break;
            default:
              this.ctx.log.debug("connecting");
              break;
          }
        },
        connected: () => {
          if (this.status === ConnectionStatus.RECONNECTING) {
            this.ctx.log.info("reconnected");
          } else {
            this.ctx.log.debug("connected");
          }

          // let the other on connected listeners see what status we're in
          setImmediate(() => (this.status = ConnectionStatus.CONNECTED));
        },
        closed: () => {
          this.status = ConnectionStatus.DISCONNECTED;
          this.ctx.log.debug("disconnected");
        },
        error: (error) => {
          if (this.status === ConnectionStatus.RECONNECTING) {
            this.ctx.log.error("failed to reconnect", { error });
          } else {
            this.ctx.log.error("connection error", { error });
          }
        },
      },
    });
  }

  /**
   * Subscribe to a GraphQL subscription.
   */
  subscribe<Subscription extends GraphQLSubscription>(
    ctx: Context,
    {
      subscription,
      variables,
      onResponse,
      onError: optionsOnError,
      onComplete = noop,
    }: {
      subscription: Subscription;
      variables?: Thunk<Subscription["Variables"]> | null;
      onResponse: (response: ExecutionResult<Subscription["Data"], Subscription["Extensions"]>) => Promisable<void>;
      onError: (error: EditError) => Promisable<void>;
      onComplete?: () => Promisable<void>;
    },
  ): () => void {
    let request = { query: subscription, variables: unthunk(variables) };

    const removeConnectedListener = this._graphqlWsClient.on("connected", () => {
      if (this.status === ConnectionStatus.RECONNECTING) {
        request = { query: subscription, variables: unthunk(variables) };
        ctx.log.info("re-subscribing to graphql subscription");
      }
    });

    const queue = new PQueue({ concurrency: 1 });
    const onError = (error: unknown): Promisable<void> => optionsOnError(new EditError(subscription, error));

    const unsubscribe = this._graphqlWsClient.subscribe<Subscription["Data"], Subscription["Extensions"]>(request, {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      next: (response) => queue.add(() => onResponse(response)).catch(onError),
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      error: (error) => queue.add(() => onError(error)),
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      complete: () => queue.add(() => onComplete()).catch(onError),
    });

    return () => {
      removeConnectedListener();
      unsubscribe();
    };
  }

  /**
   * Execute a GraphQL query or mutation.
   */
  async execute<Operation extends GraphQLQuery | GraphQLMutation>(
    ctx: Context,
    request: {
      operation: Operation;
      variables?: Thunk<Operation["Variables"]> | null;
      http?: HttpOptions;
    },
  ): Promise<ExecutionResult<Operation["Data"], Operation["Extensions"]>> {
    assert(ctx.app, "missing app when executing GraphQL query");

    const cookie = loadCookie();
    assert(cookie, "missing cookie when executing GraphQL request");

    let subdomain = ctx.app.slug;
    if (ctx.app.hasSplitEnvironments) {
      subdomain += "--development";
    }

    try {
      const json = await http({
        context: { ctx },
        method: "POST",
        url: `https://${subdomain}.${config.domains.app}/edit/api/graphql`,
        headers: { cookie },
        json: { query: request.operation, variables: unthunk(request.variables) },
        responseType: "json",
        resolveBodyOnly: true,
        throwHttpErrors: false,
        ...request.http,
      });

      if (!isObject(json) || (!("data" in json) && !("errors" in json))) {
        ctx.log.error("received invalid graphql response", { error: json });
        throw json;
      }

      return json as Operation["Response"];
    } catch (error) {
      throw new EditError(request.operation, error);
    }
  }

  /**
   * Close the connection to the server.
   */
  async dispose(): Promise<void> {
    await this._graphqlWsClient.dispose();
  }
}
