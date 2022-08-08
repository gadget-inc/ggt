import Debug from "debug";
import type { ClientOptions, ExecutionResult, Sink, SubscribePayload } from "graphql-ws";
import { createClient } from "graphql-ws";
import type { ClientRequestArgs } from "http";
import { has, isFunction, noop } from "lodash";
import type { JsonObject } from "type-fest";
import type { CloseEvent } from "ws";
import WebSocket from "ws";
import { Env } from "./env";

const debug = Debug("ggt:client");

enum ConnectionStatus {
  CONNECTED,
  DISCONNECTED,
  RECONNECTING,
}

export class Client {
  // assume the client is going to connect
  status = ConnectionStatus.CONNECTED;

  private _client: ReturnType<typeof createClient>;

  constructor(app: string, options?: Partial<ClientOptions> & { ws?: Partial<WebSocket.ClientOptions> }) {
    this._client = createClient({
      url: `wss://${app}.${Env.productionLike ? "gadget.app" : "ggt.pub:3000"}/edit/api/graphql-ws`,
      shouldRetry: () => true,
      webSocketImpl: class extends WebSocket {
        constructor(address: string | URL, protocols?: string | string[], wsOptions?: WebSocket.ClientOptions | ClientRequestArgs) {
          super(address, protocols, { ...wsOptions, ...options?.ws });
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
        ...options?.on,
      },
      ...options,
    });
  }

  subscribe<Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject = JsonObject>(
    payload: Payload<Data, Variables>,
    sink: Sink<ExecutionResult<Data, Extensions>>
  ): () => void {
    let subscribePayload: SubscribePayload;
    let removeConnectedListener: () => void;

    if (isFunction(payload.variables)) {
      // the caller wants us to re-evaluate the variables every time graphql-ws re-subscribes after reconnecting
      subscribePayload = { ...payload, variables: payload.variables() };
      removeConnectedListener = this._client.on("connected", () => {
        if (this.status == ConnectionStatus.RECONNECTING) {
          // subscribePayload.variables is supposed to be readonly (it's not) and payload.variables could been re-assigned (it won't)
          (subscribePayload as any).variables = (payload.variables as any)();
          debug("re-sending query %s", subscribePayload.query);
        }
      });
    } else {
      subscribePayload = payload as SubscribePayload;
    }

    debug("sending query %s", subscribePayload.query);
    const unsubscribe = this._client.subscribe(subscribePayload, sink);

    return () => {
      removeConnectedListener?.();
      unsubscribe();
    };
  }

  query<Data extends JsonObject, Variables extends JsonObject, Extensions extends JsonObject = JsonObject>(
    payload: Payload<Data, Variables>
  ): Promise<ExecutionResult<Data, Extensions>> {
    return new Promise((resolve, reject) => {
      this.subscribe<Data, Variables, Extensions>(payload, {
        next: resolve,
        error: (error) => reject(new ClientError(payload, error)),
        complete: noop,
      });
    });
  }

  async unwrapQuery<Data extends JsonObject, Variables extends JsonObject>(payload: Payload<Data, Variables>): Promise<Data> {
    const result = await this.query(payload);
    if (result.errors) throw new ClientError(payload, result.errors);
    if (!result.data) throw new ClientError(payload, new Error("No data"));
    return result.data;
  }

  async dispose(): Promise<void> {
    await this._client.dispose();
  }
}

export class ClientError extends Error {
  constructor(readonly payload: Payload<any, any>, readonly cause: any) {
    function isCloseEvent(e: unknown): e is CloseEvent {
      return has(e, "wasClean");
    }

    super(isCloseEvent(cause) ? `Unexpected close event: ${cause.code} ${cause.reason}` : "Unexpected GraphQL error");
    this.name = "ClientError";
  }
}

export type Query<Data extends JsonObject, Variables extends JsonObject = JsonObject> = string & {
  __TData?: Data;
  __TVariables?: Variables;
};

export interface Payload<Data extends JsonObject, Variables extends JsonObject> {
  readonly query: Query<Data, Variables>;
  readonly variables?: Variables | (() => Variables) | null;
}
