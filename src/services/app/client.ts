import type { ExecutionResult } from "graphql-ws";
import { createClient } from "graphql-ws";
import ms from "ms";
import type { ClientRequestArgs } from "node:http";
import PQueue from "p-queue";
import type { Promisable } from "type-fest";
import WebSocket from "ws";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { loadAuthHeaders } from "../http/auth.js";
import { http, type HttpOptions } from "../http/http.js";
import { getUser } from "../user/user.js";
import { noop, unthunk, type Thunk } from "../util/function.js";
import { isObject } from "../util/is.js";
import type { Environment } from "./app.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "./edit/operation.js";
import { AuthenticationError, ClientError } from "./error.js";

enum ConnectionStatus {
  CONNECTED,
  DISCONNECTED,
  RECONNECTING,
}

/**
 * Client is a GraphQL client connected to a Gadget application's
 * given endpoint.
 */
export class Client {
  // assume the client is going to connect
  status = ConnectionStatus.CONNECTED;

  readonly ctx: Context;

  private _graphqlWsClient: ReturnType<typeof createClient>;
  private _sessionUpdateInterval: NodeJS.Timeout | undefined;

  constructor(
    ctx: Context,
    readonly environment: Environment,
    readonly endpoint: string,
  ) {
    this.ctx = ctx.child({ name: "client" });

    this._graphqlWsClient = createClient({
      url: `wss://${environment.application.slug}.${config.domains.app}/edit/api/graphql-ws`, // FIXME: this assumes this is an Edit client
      keepAlive: ms("10s"),
      shouldRetry: () => true,
      connectionParams: {
        environment: environment.name,
      },
      webSocketImpl: class extends WebSocket {
        constructor(address: string | URL, protocols?: string | string[], wsOptions?: WebSocket.ClientOptions | ClientRequestArgs) {
          super(address, protocols, {
            signal: ctx.signal,
            ...wsOptions,
            headers: {
              ...wsOptions?.headers,
              "user-agent": config.versionFull,
              ...loadAuthHeaders(ctx),
            },
          });
        }
      },
      on: {
        opened: () => {
          this.ctx.log.trace("opened");
        },
        ping: (received) => {
          this.ctx.log.trace("ping", { received });
        },
        pong: (received) => {
          this.ctx.log.trace("pong", { received });
        },
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
      onError: (error: ClientError) => Promisable<void>;
      onComplete?: () => Promisable<void>;
    },
  ): () => void {
    const payload = { query: subscription, variables: unthunk(variables) };

    const removeConnectedListener = this._graphqlWsClient.on("connected", () => {
      if (this.status === ConnectionStatus.RECONNECTING) {
        payload.variables = unthunk(variables);
        ctx.log.info("re-subscribing to graphql subscription");
      }

      /* A long-running websocket will not update the session without other API calls will not update the session */
      this._sessionUpdateInterval = setInterval(() => {
        void getUser(this.ctx)
          .catch((error: unknown) => this.ctx.abort(error))
          .then((res) => {
            if (!res) {
              /* If this 401s, then give up as we cannot just refresh */
              this.ctx.abort(new AuthenticationError(undefined));
            }
          }); /* The Set-Cookie header handler from http.ts will ensure this updates the session. */
      }, ms("30m")).unref();
      this.ctx.done.finally(() => {
        if (this._sessionUpdateInterval) {
          clearInterval(this._sessionUpdateInterval);
        }
      });
    });

    const queue = new PQueue({ concurrency: 1 });
    const onError = (error: unknown): Promisable<void> => optionsOnError(new ClientError(subscription, error));

    const unsubscribe = this._graphqlWsClient.subscribe<Subscription["Data"], Subscription["Extensions"]>(payload, {
      next: (response) => void queue.add(() => onResponse(response)).catch(onError),
      error: (error) => void queue.add(() => onError(error)),
      complete: () => void queue.add(() => onComplete()).catch(onError),
    });

    return () => {
      ctx.log.trace("unsubscribing from graphql subscription");
      removeConnectedListener();
      queue.clear();
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
    let subdomain = this.environment.application.slug;
    if (this.environment.application.multiEnvironmentEnabled) {
      if (this.environment.type !== "production") {
        subdomain += `--${this.environment.name}`;
      }
    } else if (this.environment.application.hasSplitEnvironments) {
      subdomain += "--development";
    }

    try {
      const json = await http({
        context: { ctx },
        method: "POST",
        url: `https://${subdomain}.${config.domains.app}${this.endpoint}`,
        headers: { ...loadAuthHeaders(ctx), "x-gadget-environment": this.environment.name },
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
      throw new ClientError(request.operation, error);
    }
  }

  /**
   * Close the connection to the server.
   */
  async dispose(): Promise<void> {
    await this._graphqlWsClient.dispose();
  }
}
