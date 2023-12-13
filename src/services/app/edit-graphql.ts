import type { ExecutionResult } from "graphql-ws";
import { createClient } from "graphql-ws";
import assert from "node:assert";
import type { ClientRequestArgs } from "node:http";
import { dedent } from "ts-dedent";
import type { JsonObject } from "type-fest";
import type { CloseEvent } from "ws";
import WebSocket from "ws";
import type {
  FileSyncFilesQuery,
  FileSyncFilesQueryVariables,
  FileSyncHashesQuery,
  FileSyncHashesQueryVariables,
  PublishFileSyncEventsMutation,
  PublishFileSyncEventsMutationVariables,
  publishStatusSubscription,
  publishStatusSubscriptionVariables,
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables,
  RemoteFilesVersionQuery,
  RemoteFilesVersionQueryVariables,
} from "../../__generated__/graphql.js";
import { config } from "../config/config.js";
import { EditGraphQLError } from "../error/error.js";
import { createLogger } from "../output/log/logger.js";
import { noop, unthunk, type Thunk } from "../util/function.js";
import { http, loadCookie } from "../util/http.js";
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
    onData: (data: Query["Data"]) => void | Promise<void>;
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

    const json = await http({
      method: "POST",
      url: `https://${subdomain}.${config.domains.app}/edit/api/graphql`,
      headers: { cookie },
      json: payload,
      responseType: "json",
      resolveBodyOnly: true,
    });

    return json as Query["Result"];
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

export const REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION = dedent(/* GraphQL */ `
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

export const REMOTE_FILES_VERSION_QUERY = dedent(/* GraphQL */ `
  query RemoteFilesVersion {
    remoteFilesVersion
  }
`) as GraphQLQuery<RemoteFilesVersionQuery, RemoteFilesVersionQueryVariables>;

export type REMOTE_FILES_VERSION_QUERY = typeof REMOTE_FILES_VERSION_QUERY;

export const PUBLISH_FILE_SYNC_EVENTS_MUTATION = dedent(/* GraphQL */ `
  mutation PublishFileSyncEvents($input: PublishFileSyncEventsInput!) {
    publishFileSyncEvents(input: $input) {
      remoteFilesVersion
    }
  }
`) as GraphQLQuery<PublishFileSyncEventsMutation, PublishFileSyncEventsMutationVariables>;

export type PUBLISH_FILE_SYNC_EVENTS_MUTATION = typeof PUBLISH_FILE_SYNC_EVENTS_MUTATION;

export const FILE_SYNC_FILES_QUERY = dedent(/* GraphQL */ `
  query FileSyncFiles($paths: [String!]!, $filesVersion: String, $encoding: FileSyncEncoding) {
    fileSyncFiles(paths: $paths, filesVersion: $filesVersion, encoding: $encoding) {
      filesVersion
      files {
        path
        mode
        content
        encoding
      }
    }
  }
`) as GraphQLQuery<FileSyncFilesQuery, FileSyncFilesQueryVariables>;

export type FILE_SYNC_FILES_QUERY = typeof FILE_SYNC_FILES_QUERY;

export const FILE_SYNC_HASHES_QUERY = dedent(/* GraphQL */ `
  query FileSyncHashes($filesVersion: String) {
    fileSyncHashes(filesVersion: $filesVersion) {
      filesVersion
      hashes
    }
  }
`) as GraphQLQuery<FileSyncHashesQuery, FileSyncHashesQueryVariables>;

export type FILE_SYNC_HASHES_QUERY = typeof FILE_SYNC_HASHES_QUERY;

export const REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION = dedent(/* GraphQL */ `
  subscription publishStatus($localFilesVersion: String!, $force: Boolean) {
    publishStatus(localFilesVersion: $localFilesVersion, force: $force) {
      remoteFilesVersion
      progress
      issues {
        severity
        message
        node {
          type
          key
          name
          fieldType
          parentKey
          parentApiIdentifier
        }
      }
    }
  }
`) as GraphQLQuery<publishStatusSubscription, publishStatusSubscriptionVariables>;

export type REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION = typeof REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION;
