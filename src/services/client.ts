import assert from "assert";
import Debug from "debug";
import type { GraphQLError } from "graphql";
import type { ExecutionResult, SubscribePayload } from "graphql-ws";
import { createClient } from "graphql-ws";
import type { ClientRequestArgs } from "http";
import _ from "lodash";
import type { JsonObject, SetOptional } from "type-fest";
import type { CloseEvent, ErrorEvent } from "ws";
import WebSocket from "ws";
import { context } from "./context.js";
import { ClientError } from "./errors.js";

const debug = Debug("ggt:client");

enum ConnectionStatus {
  CONNECTED,
  DISCONNECTED,
  RECONNECTING,
}

/**
 * Client is a GraphQL client connected to a Gadget application's /edit/api/graphql-ws endpoint.
 *
 * NOTE: In order to use the Client, the user must be logged in and an app must have been selected (`context.app` and
 * `context.session` must be set).
 */
export class Client {
  // assume the client is going to connect
  status = ConnectionStatus.CONNECTED;

  private _client: ReturnType<typeof createClient>;

  constructor() {
    assert(context.app, "context.app must be set before instantiating the Client");

    this._client = createClient({
      url: `wss://${context.app.slug}.${context.domains.app}/edit/api/graphql-ws`,
      shouldRetry: () => true,
      webSocketImpl: class extends WebSocket {
        constructor(address: string | URL, protocols?: string | string[], wsOptions?: WebSocket.ClientOptions | ClientRequestArgs) {
          assert(context.session, "context.session must be set before instantiating the Client");
          super(address, protocols, {
            ...wsOptions,
            headers: {
              ...wsOptions?.headers,
              "user-agent": context.config.userAgent,
              cookie: `session=${encodeURIComponent(context.session)};`,
            },
          });
        }
      },
      on: {
        connecting: () => {
          switch (this.status) {
            case ConnectionStatus.DISCONNECTED:
              this.status = ConnectionStatus.RECONNECTING;
              debug("reconnecting...");
              break;
            case ConnectionStatus.RECONNECTING:
              debug("retrying...");
              break;
            default:
              debug("connecting...");
              break;
          }
        },
        connected: () => {
          if (this.status === ConnectionStatus.RECONNECTING) {
            debug("reconnected");
          } else {
            debug("connected");
          }

          // let the other on connected listeners see what status we're in
          setImmediate(() => (this.status = ConnectionStatus.CONNECTED));
        },
        closed: (e) => {
          const event = e as CloseEvent;
          if (event.wasClean) {
            debug("connection closed");
            return;
          }

          if (this.status === ConnectionStatus.CONNECTED) {
            this.status = ConnectionStatus.DISCONNECTED;
            debug("disconnected");
          }
        },
        error: (error) => {
          if (this.status == ConnectionStatus.RECONNECTING) {
            debug("failed to reconnect %o", { error });
          } else {
            debug("connection error %o", { error });
          }
        },
      },
    });
  }

  subscribe<Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject = JsonObject>(
    payload: Payload<Data, Variables>,
    sink: SetOptional<Sink<Data, Extensions>, "complete">,
  ): () => void {
    let subscribePayload: SubscribePayload;
    let removeConnectedListener: () => void;

    if (_.isFunction(payload.variables)) {
      // the caller wants us to re-evaluate the variables every time graphql-ws re-subscribes after reconnecting
      subscribePayload = { ...payload, variables: payload.variables() };
      removeConnectedListener = this._client.on("connected", () => {
        if (this.status == ConnectionStatus.RECONNECTING) {
          // subscribePayload.variables is supposed to be readonly (it's not) and payload.variables may have been re-assigned (it won't)
          (subscribePayload as any).variables = (payload.variables as any)();
          debug("re-sending %s%s%O", subscribePayload.query.split(/\s+/g, 1)[0], subscribePayload.query, subscribePayload.variables);
        }
      });
    } else {
      subscribePayload = payload as SubscribePayload;
    }

    debug("sending %s%s%O", subscribePayload.query.split(/\s+/g, 1)[0], subscribePayload.query, subscribePayload.variables);
    const unsubscribe = this._client.subscribe(subscribePayload, {
      next: (result: ExecutionResult<Data, Extensions>) => sink.next(result),
      error: (error) => sink.error(new ClientError(subscribePayload, error as Error | GraphQLError[] | CloseEvent | ErrorEvent)),
      complete: () => sink.complete?.(),
    });

    return () => {
      removeConnectedListener?.();
      unsubscribe();
    };
  }

  subscribeUnwrap<Data extends JsonObject, Variables extends JsonObject>(
    payload: Payload<Data, Variables>,
    sink: { next: (data: Data) => void; error: (error: ClientError) => void },
  ): () => void {
    const unsubscribe = this.subscribe(payload, {
      ...sink,
      next: (result) => {
        if (result.errors) {
          unsubscribe();
          sink.error(new ClientError(payload, result.errors));
          return;
        }

        if (!result.data) {
          sink.error(new ClientError(payload, "We received a response without data"));
          unsubscribe();
          return;
        }

        sink.next(result.data);
      },
    });

    return unsubscribe;
  }

  query<Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject = JsonObject>(
    payload: Payload<Data, Variables>,
  ): Promise<ExecutionResult<Data, Extensions>> {
    return new Promise((resolve, reject) => {
      this.subscribe<Data, Variables, Extensions>(payload, { next: resolve, error: reject });
    });
  }

  async queryUnwrap<Data extends JsonObject, Variables extends JsonObject>(payload: Payload<Data, Variables>): Promise<Data> {
    const result = await this.query(payload);
    if (result.errors) throw new ClientError(payload, result.errors);
    if (!result.data) throw new ClientError(payload, "We received a response without data");
    return result.data;
  }

  async dispose(): Promise<void> {
    await this._client.dispose();
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
