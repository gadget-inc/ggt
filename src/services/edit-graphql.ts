import type { GraphQLError } from "graphql";
import type { ExecutionResult, SubscribePayload } from "graphql-ws";
import { createClient } from "graphql-ws";
import { constant, isFunction, noop, split } from "lodash";
import assert from "node:assert";
import type { ClientRequestArgs } from "node:http";
import type { JsonObject, SetOptional } from "type-fest";
import type { CloseEvent, ErrorEvent } from "ws";
import WebSocket from "ws";
import type { App } from "./app.js";
import { config } from "./config.js";
import { ClientError } from "./errors.js";
import { loadCookie } from "./http.js";
import { createLogger } from "./log.js";

enum ConnectionStatus {
  CONNECTED,
  DISCONNECTED,
  RECONNECTING,
}

const log = createLogger("edit-graphql");

/**
 * EditGraphQL is a GraphQL client connected to a Gadget application's /edit/api/graphql-ws endpoint.
 */
export class EditGraphQL {
  // assume the client is going to connect
  status = ConnectionStatus.CONNECTED;

  private _client: ReturnType<typeof createClient>;

  constructor(app: App) {
    this._client = createClient({
      url: `wss://${app.slug}.${config.domains.app}/edit/api/graphql-ws`,
      shouldRetry: constant(true),
      webSocketImpl: class extends WebSocket {
        constructor(address: string | URL, protocols?: string | string[], wsOptions?: WebSocket.ClientOptions | ClientRequestArgs) {
          // this cookie should be available since we were given an app which requires a cookie to load
          const cookie = loadCookie();
          assert(cookie, "missing cookie when connecting to GraphQL API");

          super(address, protocols, {
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
              log.info("reconnecting");
              break;
            case ConnectionStatus.RECONNECTING:
              log.info("retrying");
              break;
            default:
              log.info("connecting");
              break;
          }
        },
        connected: () => {
          if (this.status === ConnectionStatus.RECONNECTING) {
            log.info("reconnected");
          } else {
            log.info("connected");
          }

          // let the other on connected listeners see what status we're in
          setImmediate(() => (this.status = ConnectionStatus.CONNECTED));
        },
        closed: (e) => {
          const event = e as CloseEvent;
          if (event.wasClean) {
            log.info("connection closed");
            return;
          }

          if (this.status === ConnectionStatus.CONNECTED) {
            this.status = ConnectionStatus.DISCONNECTED;
            log.info("disconnected");
          }
        },
        error: (error) => {
          if (this.status == ConnectionStatus.RECONNECTING) {
            log.error("failed to reconnect", { error });
          } else {
            log.error("connection error", { error });
          }
        },
      },
    });
  }

  /**
   * Subscribe to a GraphQL query.
   *
   * This method is typically used to subscribe to a GraphQL
   * subscription. If you want to execute a GraphQL query or mutation,
   * use {@link EditGraphQL.query} instead.
   *
   * @param payload The query and variables to send to the server.
   * @param sink The callbacks to invoke when the server responds.
   * @returns A function to unsubscribe from the subscription.
   */
  subscribe<Data extends JsonObject, Variables extends JsonObject>(
    payload: Payload<Data, Variables>,
    sink: { next: (data: Data) => void; error: (error: ClientError) => void },
  ): () => void {
    const unsubscribe = this._subscribe(payload, {
      ...sink,
      next: (result) => {
        if (result.errors) {
          unsubscribe();
          sink.error(new ClientError(payload, result.errors));
          return;
        }

        if (!result.data) {
          sink.error(new ClientError(payload, "Received a GraphQL response without errors or data"));
          unsubscribe();
          return;
        }

        sink.next(result.data);
      },
    });

    return unsubscribe;
  }

  /**
   * Execute a GraphQL query or mutation.
   * @param payload The query and variables to send to the server.
   * @returns The data returned by the server.
   */
  async query<Data extends JsonObject, Variables extends JsonObject>(payload: Payload<Data, Variables>): Promise<Data> {
    const result = await this._query(payload);
    if (result.errors) throw new ClientError(payload, result.errors);
    if (!result.data) throw new ClientError(payload, "We received a response without data");
    return result.data;
  }

  /**
   * Close the connection to the server.
   */
  async dispose(): Promise<void> {
    await this._client.dispose();
  }

  /**
   * Internal method to subscribe to a GraphQL query.
   *
   * This method shouldn't be used directly. It's exposed for testing.
   */
  _subscribe<Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject = JsonObject>(
    payload: Payload<Data, Variables>,
    sink: SetOptional<Sink<Data, Extensions>, "complete">,
  ): () => void {
    let subscribePayload: Payload<Data, Variables>;
    let removeConnectedListener = noop;

    if (isFunction(payload.variables)) {
      // the caller wants us to re-evaluate the variables every time
      // graphql-ws re-subscribes after reconnecting
      subscribePayload = { ...payload, variables: payload.variables() };
      removeConnectedListener = this._client.on("connected", () => {
        if (this.status == ConnectionStatus.RECONNECTING) {
          assert(isFunction(payload.variables));
          subscribePayload = { ...payload, variables: payload.variables() };
          const [type, operation] = split(subscribePayload.query, / |\(/, 2);
          log.info("re-sending graphql query", { type, operation });
        }
      });
    } else {
      subscribePayload = payload;
    }

    const [type, operation] = split(subscribePayload.query, / |\(/, 2);
    log.info("sending graphql query", { type, operation });

    const unsubscribe = this._client.subscribe(subscribePayload as SubscribePayload, {
      next: (result: ExecutionResult<Data, Extensions>) => {
        sink.next(result);
      },
      error: (error) => {
        sink.error(new ClientError(subscribePayload, error as Error | GraphQLError[] | CloseEvent | ErrorEvent));
      },
      complete: () => {
        sink.complete?.();
      },
    });

    return () => {
      removeConnectedListener();
      unsubscribe();
    };
  }

  private _query<Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject = JsonObject>(
    payload: Payload<Data, Variables>,
  ): Promise<ExecutionResult<Data, Extensions>> {
    return new Promise((resolve, reject) => {
      this._subscribe<Data, Variables, Extensions>(payload, { next: resolve, error: reject });
    });
  }
}

export type Query<
  Data extends JsonObject,
  Variables extends JsonObject = JsonObject,
  Extensions extends JsonObject = JsonObject,
> = string & {
  __TData?: Data;
  __TVariables?: Variables;
  __TExtensions?: Extensions;
};

export interface Payload<Data extends JsonObject, Variables extends JsonObject> {
  readonly query: Query<Data, Variables>;
  readonly variables?: Variables | (() => Variables) | null;
}

export interface Sink<Data extends JsonObject, Extensions extends JsonObject> {
  next(value: ExecutionResult<Data, Extensions>): void;
  error(error: ClientError): void;
  complete(): void;
}
