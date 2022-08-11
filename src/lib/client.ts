import Debug from "debug";
import type { GraphQLError } from "graphql";
import type { ClientOptions, ExecutionResult, SubscribePayload } from "graphql-ws";
import { createClient } from "graphql-ws";
import type { ClientRequestArgs } from "http";
import { isFunction, noop } from "lodash";
import type { JsonObject, SetOptional } from "type-fest";
import type { CloseEvent, ErrorEvent } from "ws";
import WebSocket from "ws";
import { Env } from "./env";
import { ClientError } from "./errors";

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
    sink: SetOptional<Sink<Data, Extensions>, "complete">
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
    const unsubscribe = this._client.subscribe(subscribePayload, {
      next: (result: ExecutionResult<Data, Extensions>) => sink.next(result),
      error: (error) => sink.error(new ClientError(subscribePayload, error as Error | GraphQLError[] | CloseEvent | ErrorEvent)),
      complete: () => sink.complete?.() ?? noop,
    });

    return () => {
      removeConnectedListener?.();
      unsubscribe();
    };
  }

  subscribeUnwrap<Data extends JsonObject, Variables extends JsonObject>(
    payload: Payload<Data, Variables>,
    sink: { next: (data: Data) => void; error: (error: ClientError) => void }
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
    payload: Payload<Data, Variables>
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
  Extensions extends JsonObject = JsonObject
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
