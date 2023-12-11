import type { GraphQLError } from "graphql";
import type { ExecutionResult } from "graphql-ws";
import { createClient } from "graphql-ws";
import assert from "node:assert";
import type { ClientRequestArgs } from "node:http";
import pluralize from "pluralize";
import type { JsonObject } from "type-fest";
import type { CloseEvent, ErrorEvent } from "ws";
import WebSocket from "ws";
import type {
  PublishFileSyncEventsMutation,
  PublishFileSyncEventsMutationVariables,
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables,
  RemoteFilesVersionQuery,
  RemoteFilesVersionQueryVariables,
} from "../../__generated__/graphql.js";
import { config } from "../config/config.js";
import { loadCookie } from "../http/auth.js";
import { http } from "../http/http.js";
import { createLogger } from "../output/log/logger.js";
import { CLIError, IsBug } from "../output/report.js";
import { sprint } from "../output/sprint.js";
import { uniq } from "../util/collection.js";
import { noop, unthunk, type Thunk } from "../util/function.js";
import { isCloseEvent, isError, isErrorEvent, isGraphQLErrors, isObject, isString } from "../util/is.js";
import { serializeError } from "../util/object.js";
import type { App } from "./app.js";

enum ConnectionStatus {
  CONNECTED,
  DISCONNECTED,
  RECONNECTING,
}

const log = createLogger({ name: "edit-graphql" });

/**
 * EditGraphQL is a GraphQL client connected to a Gadget application's
 * /edit/api/graphql-ws endpoint.
 */
export class EditGraphQL {
  // assume the client is going to connect
  status = ConnectionStatus.CONNECTED;

  private _client: ReturnType<typeof createClient>;

  constructor(readonly app: App) {
    let subdomain = this.app.slug;
    if (this.app.hasSplitEnvironments) {
      subdomain += "--development";
    }

    this._client = createClient({
      url: `wss://${subdomain}.${config.domains.app}/edit/api/graphql-ws`,
      shouldRetry: () => true,
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
          if (this.status === ConnectionStatus.RECONNECTING) {
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
  subscribe<Query extends GraphQLQuery>({
    onData,
    ...options
  }: {
    query: Query;
    variables?: Thunk<Query["Variables"]> | null;
    onData: (data: Query["Data"]) => void;
    onError: (error: EditGraphQLError) => void;
    onComplete?: () => void;
  }): () => void {
    const unsubscribe = this._subscribe({
      ...options,
      onResult: (result) => {
        if (result.errors) {
          unsubscribe();
          options.onError(new EditGraphQLError(options.query, result.errors));
          return;
        }

        if (!result.data) {
          unsubscribe();
          options.onError(new EditGraphQLError(options.query, "Received a GraphQL response without errors or data"));
          return;
        }

        onData(result.data);
      },
    });

    return unsubscribe;
  }

  /**
   * Execute a GraphQL query or mutation.
   *
   * @param payload The query and variables to send to the server.
   * @returns The data returned by the server.
   */
  async query<Query extends GraphQLQuery>({
    query,
    variables,
  }: {
    query: Query;
    variables?: Thunk<Query["Variables"]> | null;
  }): Promise<Query["Data"]> {
    const result = await this._query({ query, variables });
    if (result.errors) {
      throw new EditGraphQLError(query, result.errors);
    }
    if (!result.data) {
      throw new EditGraphQLError(query, "We received a response without data");
    }
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
   * This method is only exposed for testing and shouldn't be used
   * directly.
   */
  _subscribe<Query extends GraphQLQuery>({
    query,
    variables,
    onResult,
    onError,
    onComplete = noop,
  }: {
    query: Query;
    variables?: Thunk<Query["Variables"]> | null;
    onResult: (result: ExecutionResult<Query["Data"], Query["Extensions"]>) => void;
    onError: (error: EditGraphQLError) => void;
    onComplete?: () => void;
  }): () => void {
    let payload = { query, variables: unthunk(variables) };
    const [type, operation] = payload.query.split(/ |\(/, 2);

    const removeConnectedListener = this._client.on("connected", () => {
      if (this.status === ConnectionStatus.RECONNECTING) {
        payload = { query, variables: unthunk(variables) };
        log.info("re-sending graphql query via ws", { type, operation }, { variables: payload.variables });
      }
    });

    log.info("sending graphql query via ws", { type, operation }, { variables: payload.variables });
    const unsubscribe = this._client.subscribe<Query["Data"], Query["Extensions"]>(payload, {
      next: (result) => onResult(result),
      error: (error) => onError(new EditGraphQLError(query, error)),
      complete: onComplete,
    });

    return () => {
      removeConnectedListener();
      unsubscribe();
    };
  }

  private async _query<Query extends GraphQLQuery>(input: {
    query: Query;
    variables?: Thunk<Query["Variables"]> | null;
  }): Promise<ExecutionResult<Query["Data"], Query["Extensions"]>> {
    const cookie = loadCookie();
    assert(cookie, "missing cookie when connecting to GraphQL API");

    let subdomain = this.app.slug;
    if (this.app.hasSplitEnvironments) {
      subdomain += "--development";
    }

    const payload = { ...input, variables: unthunk(input.variables) };
    const [type, operation] = payload.query.split(/ |\(/, 2);
    log.info("sending graphql query via http", { type, operation }, { variables: payload.variables });

    try {
      const json = await http({
        method: "POST",
        url: `https://${subdomain}.${config.domains.app}/edit/api/graphql`,
        headers: { cookie },
        json: payload,
        responseType: "json",
        resolveBodyOnly: true,
        throwHttpErrors: false,
      });

      if (!isObject(json) || (!("data" in json) && !("errors" in json))) {
        log.error("received invalid graphql response", { error: json });
        throw json;
      }

      return json as Query["Result"];
    } catch (error) {
      throw new EditGraphQLError(input.query, error);
    }
  }
}

export class EditGraphQLError extends CLIError {
  isBug = IsBug.MAYBE;

  override cause: string | Error | readonly GraphQLError[] | CloseEvent | ErrorEvent;

  constructor(
    readonly query: GraphQLQuery,
    cause: unknown,
  ) {
    super("An error occurred while communicating with Gadget");

    // ErrorEvent and CloseEvent aren't serializable, so we reconstruct
    // them into an object. We discard the `target` property because
    // it's large and not that useful
    if (isErrorEvent(cause)) {
      this.cause = {
        type: cause.type,
        message: cause.message,
        error: serializeError(cause.error),
      } as ErrorEvent;
    } else if (isCloseEvent(cause)) {
      this.cause = {
        type: cause.type,
        code: cause.code,
        reason: cause.reason,
        wasClean: cause.wasClean,
      } as CloseEvent;
    } else {
      assert(
        isString(cause) || isError(cause) || isGraphQLErrors(cause),
        "cause must be a string, Error, GraphQLError[], CloseEvent, or ErrorEvent",
      );
      this.cause = cause;
    }
  }

  override render(): string {
    let body = "";

    switch (true) {
      case isGraphQLErrors(this.cause): {
        const errors = uniq(this.cause.map((x) => x.message));
        body = sprint`
          Gadget responded with the following ${pluralize("error", errors.length, false)}:

            • ${errors.join("\n            • ")}
        `;
        break;
      }
      case isCloseEvent(this.cause):
        body = "The connection to Gadget closed unexpectedly.";
        break;
      case isErrorEvent(this.cause) || isError(this.cause):
        body = this.cause.message;
        break;
      default:
        body = this.cause;
        break;
    }

    return this.message + "\n\n" + body;
  }
}

/**
 * A GraphQL query with its associated types.
 *
 * At runtime, this type is just a string.
 */
export type GraphQLQuery<
  Data extends JsonObject = JsonObject,
  Variables extends JsonObject = JsonObject,
  Extensions extends JsonObject = JsonObject,
  Result extends ExecutionResult<Data, Extensions> = ExecutionResult<Data, Extensions>,
> = string & {
  Data: Data;
  Variables: Variables;
  Extensions: Extensions;
  Result: Result;
};

export const REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION = sprint(/* GraphQL */ `
  subscription RemoteFileSyncEvents($localFilesVersion: String!) {
    remoteFileSyncEvents(localFilesVersion: $localFilesVersion, encoding: base64) {
      remoteFilesVersion
      changed {
        path
        mode
        content
        encoding
      }
      deleted {
        path
      }
    }
  }
`) as GraphQLQuery<RemoteFileSyncEventsSubscription, RemoteFileSyncEventsSubscriptionVariables>;

export type REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION = typeof REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION;

export const REMOTE_FILES_VERSION_QUERY = sprint(/* GraphQL */ `
  query RemoteFilesVersion {
    remoteFilesVersion
  }
`) as GraphQLQuery<RemoteFilesVersionQuery, RemoteFilesVersionQueryVariables>;

export type REMOTE_FILES_VERSION_QUERY = typeof REMOTE_FILES_VERSION_QUERY;

export const PUBLISH_FILE_SYNC_EVENTS_MUTATION = sprint(/* GraphQL */ `
  mutation PublishFileSyncEvents($input: PublishFileSyncEventsInput!) {
    publishFileSyncEvents(input: $input) {
      remoteFilesVersion
    }
  }
`) as GraphQLQuery<PublishFileSyncEventsMutation, PublishFileSyncEventsMutationVariables>;

export type PUBLISH_FILE_SYNC_EVENTS_MUTATION = typeof PUBLISH_FILE_SYNC_EVENTS_MUTATION;
