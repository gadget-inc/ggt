import type { ExecutionResult, FormattedExecutionResult } from "graphql-ws";
import type { ClientRequestArgs } from "node:http";
import type { Promisable } from "type-fest";

import { createClient } from "graphql-ws";
import ms from "ms";
import PQueue from "p-queue";
import WebSocket from "ws";

import type { Context } from "../command/context.js";
import type { Environment } from "./app.js";
import type { GraphQLMutation, GraphQLQuery, GraphQLSubscription } from "./edit/operation.js";

import { config } from "../config/config.js";
import { loadAuthHeaders } from "../http/auth.js";
import { http, type HttpOptions } from "../http/http.js";
import { getUser } from "../user/user.js";
import { noop, unthunk, type Thunk } from "../util/function.js";
import { isArray, isObject } from "../util/is.js";
import { calculateBackoffDelay, DEFAULT_RETRY_LIMIT, isRetryableErrorCause, type RetryOptions } from "../util/retry.js";
import { AuthenticationError, ClientError } from "./error.js";

/**
 * An object that can be used to unsubscribe and resubscribe to an
 * ongoing GraphQL subscription.
 */
export type ClientSubscription<Subscription extends GraphQLSubscription> = {
  /**
   * Unsubscribe from the subscription.
   */
  unsubscribe(): void;

  /**
   * Resubscribe to the subscription with optional new variables.
   */
  resubscribe(variables?: Thunk<Subscription["Variables"]> | null): void;
};

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
          const headers = isArray(wsOptions?.headers)
            ? (Object.fromEntries(wsOptions.headers.map((header: string) => header.split(": ", 2))) as Record<string, string>)
            : (wsOptions?.headers as Record<string, string> | undefined);

          super(address, protocols, {
            signal: ctx.signal,
            ...wsOptions,
            headers: {
              ...headers,
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
   *
   * @param ctx - The context for the subscription.
   * @param options - The subscription options.
   * @param options.subscription - The GraphQL subscription to subscribe to.
   * @param options.variables - The variables to send to the server.
   * @param options.onData - A callback that will be called when data is received from the server.
   * @param options.onError - A callback that will be called when an error is received from the server.
   * @param options.onComplete - A callback that will be called when the subscription ends.
   * @param options.retry - Optional retry configuration for automatic resubscription on transient errors.
   * @returns A ClientSubscription object to control the subscription.
   */
  subscribe<Subscription extends GraphQLSubscription>(
    ctx: Context,
    {
      subscription,
      variables: initialVariables,
      onData,
      onError: optionsOnError,
      onComplete: optionsOnComplete = noop,
      retry: retryOptions,
    }: {
      subscription: Subscription;
      variables?: Thunk<Subscription["Variables"]> | null;
      onData: (data: Subscription["Data"]) => Promisable<void>;
      onError: (error: ClientError) => Promisable<void>;
      onComplete?: () => Promisable<void>;
      retry?: RetryOptions;
    },
  ): ClientSubscription<Subscription> {
    const maxAttempts = retryOptions?.maxAttempts ?? DEFAULT_RETRY_LIMIT;
    let retryCount = 0;
    let retryTimeoutId: NodeJS.Timeout | undefined;
    let currentVariables = initialVariables;
    const currentCtx = ctx;

    const payload = { query: subscription, variables: unthunk(currentVariables) };

    const addConnectedListener = (): (() => void) => {
      return this._graphqlWsClient.on("connected", () => {
        if (this.status === ConnectionStatus.RECONNECTING) {
          payload.variables = unthunk(currentVariables);
          currentCtx.log.info("re-subscribing to graphql subscription");
        }

        /* A long-running websocket connection won't refresh the session cookie without periodic API calls */
        if (this._sessionUpdateInterval) {
          clearInterval(this._sessionUpdateInterval);
        }
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
    };

    let removeConnectedListener = addConnectedListener();

    const queue = new PQueue({ concurrency: 1 });

    /**
     * Schedule a retry attempt with exponential backoff.
     * Returns true if retry was scheduled, false if retry budget exhausted.
     *
     * Note: When multiple errors arrive before the retry timeout fires,
     * `onRetry` is called for each error (for observability/logging), but
     * only a single retry attempt is scheduled and the retry budget is only
     * decremented once. This prevents rapid successive errors from exhausting
     * the retry budget prematurely.
     */
    const scheduleRetry = (error: ClientError, logError: unknown): boolean => {
      if (!retryOptions || !isRetryableErrorCause(error.cause) || retryCount >= maxAttempts) {
        return false;
      }

      // Only increment retryCount if no retry is already pending.
      // This prevents exhausting the retry budget when multiple errors
      // arrive before the retry timeout fires.
      if (!retryTimeoutId) {
        retryCount++;
      }
      const delay = calculateBackoffDelay(retryCount);

      currentCtx.log.warn("subscription error, retrying...", {
        retryCount,
        maxAttempts,
        delayMs: Math.round(delay),
        error: logError,
      });
      retryOptions.onRetry?.(retryCount, error);

      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
      retryTimeoutId = setTimeout(() => {
        retryTimeoutId = undefined;
        clientSubscription.resubscribe();
      }, delay);

      return true;
    };

    const onResponse = async (response: FormattedExecutionResult<Subscription["Data"], Subscription["Extensions"]>): Promise<void> => {
      if (response.errors) {
        const error = new ClientError(subscription, response.errors);
        if (scheduleRetry(error, response.errors)) {
          return;
        }

        doUnsubscribe();
        await optionsOnError(error);
        return;
      }

      if (!response.data) {
        doUnsubscribe();
        await optionsOnError(new ClientError(subscription, "Subscription response did not contain data"));
        return;
      }

      // Reset retry count on successful data
      if (retryCount > 0) {
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = undefined;
        }
        currentCtx.log.info("subscription recovered", { retriesNeeded: retryCount });
        retryCount = 0;
      }

      await onData(response.data);
    };

    const onError = async (error: ClientError): Promise<void> => {
      if (scheduleRetry(error, error.cause)) {
        return;
      }

      doUnsubscribe();
      await optionsOnError(error);
    };

    const onComplete = async (): Promise<void> => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = undefined;
      }
      await optionsOnComplete();
    };

    let unsubscribe = this._graphqlWsClient.subscribe<Subscription["Data"], Subscription["Extensions"]>(payload, {
      next: (response) => void queue.add(() => onResponse(response)).catch((err) => onError(new ClientError(subscription, err))),
      error: (error) => void queue.add(() => onError(new ClientError(subscription, error))),
      complete: () => void queue.add(() => onComplete()).catch((err) => onError(new ClientError(subscription, err))),
    });

    const doUnsubscribe = (): void => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = undefined;
      }
      currentCtx.log.trace("unsubscribing from graphql subscription");
      removeConnectedListener();
      queue.clear();
      unsubscribe();
    };

    const clientSubscription: ClientSubscription<Subscription> = {
      unsubscribe: () => {
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = undefined;
        }
        doUnsubscribe();
      },
      resubscribe: (newVariables) => {
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = undefined;
        }
        removeConnectedListener();
        queue.clear();
        unsubscribe();

        if (newVariables !== undefined) {
          currentVariables = newVariables;
        }

        payload.variables = unthunk(currentVariables);
        currentCtx.log.info("re-subscribing to graphql subscription");

        removeConnectedListener = addConnectedListener();
        unsubscribe = this._graphqlWsClient.subscribe<Subscription["Data"], Subscription["Extensions"]>(payload, {
          next: (response) => void queue.add(() => onResponse(response)).catch((err) => onError(new ClientError(subscription, err))),
          error: (error) => void queue.add(() => onError(new ClientError(subscription, error))),
          complete: () => void queue.add(() => onComplete()).catch((err) => onError(new ClientError(subscription, err))),
        });
      },
    };

    return clientSubscription;
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
    if (this.environment.type !== "production") {
      subdomain += `--${this.environment.name}`;
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
        // oxlint-disable-next-line only-throw-error
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
