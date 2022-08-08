import type { ClientOptions, ExecutionResult, Sink, SubscribePayload } from "graphql-ws";
import { createClient } from "graphql-ws";
import type { ClientRequestArgs } from "http";
import { has, isFunction, noop } from "lodash";
import type { JsonObject } from "type-fest";
import type { CloseEvent } from "ws";
import WebSocket from "ws";
import { Env } from "./env";
import { logger } from "./logger";

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
              logger.info("🛰  reconnecting...");
              break;
            case ConnectionStatus.RECONNECTING:
              logger.trace("🛰  retrying...");
              break;
            default:
              logger.trace("🛰  connecting...");
              break;
          }
        },
        connected: () => {
          if (this.status === ConnectionStatus.RECONNECTING) {
            logger.info("🛰  reconnected");
          } else {
            logger.trace("🛰  connected");
          }

          // let the other on connected listeners see what status we're in
          setImmediate(() => (this.status = ConnectionStatus.CONNECTED));
        },
        closed: (ev) => {
          const e = ev as CloseEvent;

          // CloseEvent's get logged as `{}`, so we reconstruct it into an object here
          const event = { type: e.type, code: e.code, reason: e.reason, wasClean: e.wasClean };
          if (event.wasClean) {
            logger.trace({ event }, "🛰  connection closed");
            return;
          }

          if (this.status === ConnectionStatus.CONNECTED) {
            this.status = ConnectionStatus.DISCONNECTED;
            logger.warn({ event }, "🛰  disconnected");
          }
        },
        error: (error) => {
          if (this.status == ConnectionStatus.RECONNECTING) {
            logger.trace({ error }, "🛰  failed to reconnect");
          } else {
            logger.error({ error }, "🛰  connection error");
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
          logger.trace({ ...subscribePayload }, "🛰  re-sending query");
        }
      });
    } else {
      subscribePayload = payload as SubscribePayload;
    }

    logger.trace({ ...subscribePayload }, "🛰  sending query");
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
  constructor(readonly payload: Payload<any, any>, override readonly cause: any) {
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
