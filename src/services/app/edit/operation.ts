import type { ExecutionResult } from "graphql-ws";
import type { JsonObject } from "type-fest";
import type {
  CreateActionMutation,
  CreateActionMutationVariables,
  CreateModelFieldsMutation,
  CreateModelMutation,
  CreateModelMutationVariables,
  CreateRouteMutation,
  CreateRouteMutationVariables,
  EnvironmentLogsSubscription,
  EnvironmentLogsSubscriptionVariables,
  FileSyncComparisonHashesQuery,
  FileSyncComparisonHashesQueryVariables,
  FileSyncFilesQuery,
  FileSyncFilesQueryVariables,
  FileSyncHashesQuery,
  FileSyncHashesQueryVariables,
  PublishFileSyncEventsMutation,
  PublishFileSyncEventsMutationVariables,
  PublishStatusSubscription,
  PublishStatusSubscriptionVariables,
  RemoteFilesVersionQuery,
  RemoteFilesVersionQueryVariables,
  RemoteFileSyncEventsSubscription,
  RemoteFileSyncEventsSubscriptionVariables,
} from "../../../__generated__/graphql.js";
import { sprint } from "../../output/sprint.js";

/**
 * A GraphQL query with its associated types.
 *
 * At runtime, this is just a string.
 */
export type GraphQLQuery<
  Data extends JsonObject = JsonObject,
  Variables extends JsonObject = JsonObject,
  Extensions extends JsonObject = JsonObject,
  Response extends ExecutionResult<Data, Extensions> = ExecutionResult<Data, Extensions>,
> = string & {
  type: "query";
  Data: Data;
  Variables: Variables;
  Extensions: Extensions;
  Response: Response;
};

/**
 * A GraphQL mutation with its associated types.
 *
 * At runtime, this is just a string.
 */
export type GraphQLMutation<
  Data extends JsonObject = JsonObject,
  Variables extends JsonObject = JsonObject,
  Extensions extends JsonObject = JsonObject,
  Response extends ExecutionResult<Data, Extensions> = ExecutionResult<Data, Extensions>,
> = string & {
  type: "mutation";
  Data: Data;
  Variables: Variables;
  Extensions: Extensions;
  Response: Response;
};

/**
 * A GraphQL subscription with its associated types.
 *
 * At runtime, this is just a string.
 */
export type GraphQLSubscription<
  Data extends JsonObject = JsonObject,
  Variables extends JsonObject = JsonObject,
  Extensions extends JsonObject = JsonObject,
  Response extends ExecutionResult<Data, Extensions> = ExecutionResult<Data, Extensions>,
> = string & {
  type: "subscription";
  Data: Data;
  Variables: Variables;
  Extensions: Extensions;
  Response: Response;
};

export const ENVIRONMENT_LOGS_SUBSCRIPTION = sprint(/* GraphQL */ `
  subscription EnvironmentLogs($query: String!, $start: DateTime, $limit: Int) {
    logsSearchV2(query: $query, start: $start, limit: $limit) {
      status
      data
    }
  }
`) as GraphQLSubscription<EnvironmentLogsSubscription, EnvironmentLogsSubscriptionVariables>;

export type ENVIRONMENT_LOGS_SUBSCRIPTION = typeof ENVIRONMENT_LOGS_SUBSCRIPTION;

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
`) as GraphQLSubscription<RemoteFileSyncEventsSubscription, RemoteFileSyncEventsSubscriptionVariables>;

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
      problems {
        level
        message
        path
        type
      }
    }
  }
`) as GraphQLMutation<PublishFileSyncEventsMutation, PublishFileSyncEventsMutationVariables>;

export type PUBLISH_FILE_SYNC_EVENTS_MUTATION = typeof PUBLISH_FILE_SYNC_EVENTS_MUTATION;

export const FILE_SYNC_FILES_QUERY = sprint(/* GraphQL */ `
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

export const FILE_SYNC_HASHES_QUERY = sprint(/* GraphQL */ `
  query FileSyncHashes($filesVersion: String) {
    fileSyncHashes(filesVersion: $filesVersion) {
      filesVersion
      hashes
    }
  }
`) as GraphQLQuery<FileSyncHashesQuery, FileSyncHashesQueryVariables>;

export type FILE_SYNC_HASHES_QUERY = typeof FILE_SYNC_HASHES_QUERY;

export const FILE_SYNC_COMPARISON_HASHES_QUERY = sprint(/* GraphQL */ `
  query FileSyncComparisonHashes($filesVersion: String!) {
    fileSyncComparisonHashes(filesVersion: $filesVersion) {
      filesVersionHashes {
        filesVersion
        hashes
      }
      latestFilesVersionHashes {
        filesVersion
        hashes
      }
    }
  }
`) as GraphQLQuery<FileSyncComparisonHashesQuery, FileSyncComparisonHashesQueryVariables>;

export type FILE_SYNC_COMPARISON_HASHES_QUERY = typeof FILE_SYNC_COMPARISON_HASHES_QUERY;

export const PUBLISH_STATUS_SUBSCRIPTION = sprint(/* GraphQL */ `
  subscription PublishStatus($localFilesVersion: String!, $force: Boolean, $allowCharges: Boolean, $allowDeletedData: Boolean) {
    publishStatus(localFilesVersion: $localFilesVersion, force: $force, allowCharges: $allowCharges, allowDeletedData: $allowDeletedData) {
      publishStarted
      remoteFilesVersion
      progress
      issues {
        severity
        message
        node {
          type
          key
          apiIdentifier
          name
          fieldType
          parentKey
          parentApiIdentifier
        }
        nodeLabels {
          type
          identifier
        }
      }
      deletedModelsAndFields {
        deletedModels
        deletedModelFields {
          modelIdentifier
          fields
        }
      }
      status {
        code
        message
        output
      }
    }
  }
`) as GraphQLSubscription<PublishStatusSubscription, PublishStatusSubscriptionVariables>;

export type PUBLISH_STATUS_SUBSCRIPTION = typeof PUBLISH_STATUS_SUBSCRIPTION;

export const CREATE_MODEL_MUTATION = sprint(/* GraphQL */ `
  mutation createModel($path: String!, $fields: [CreateModelFieldsInput!]) {
    createModel(path: $path, fields: $fields) {
      remoteFilesVersion
      changed {
        path
        mode
        content
        encoding
      }
    }
  }
`) as GraphQLMutation<CreateModelMutation, CreateModelMutationVariables>;

export type CREATE_MODEL_MUTATION = typeof CREATE_MODEL_MUTATION;

export const CREATE_ACTION_MUTATION = sprint(/* GraphQL */ `
  mutation createAction($path: String!) {
    createAction(path: $path) {
      remoteFilesVersion
      changed {
        path
        mode
        content
        encoding
      }
    }
  }
`) as GraphQLMutation<CreateActionMutation, CreateActionMutationVariables>;

export type CREATE_ACTION_MUTATION = typeof CREATE_ACTION_MUTATION;

export const CREATE_ROUTE_MUTATION = sprint(/* GraphQL */ `
  mutation createRoute($method: String!, $path: String!) {
    createRoute(method: $method, path: $path) {
      remoteFilesVersion
      changed {
        path
        mode
        content
        encoding
      }
    }
  }
`) as GraphQLMutation<CreateRouteMutation, CreateRouteMutationVariables>;

export type CREATE_ROUTE_MUTATION = typeof CREATE_ROUTE_MUTATION;

export const CREATE_MODEL_FIELDS_MUTATION = sprint(/* GraphQL */ `
  mutation createModelFields($path: String!, $fields: [CreateModelFieldsInput!]!) {
    createModelFields(path: $path, fields: $fields) {
      remoteFilesVersion
      changed {
        path
        mode
        content
        encoding
      }
    }
  }
`) as GraphQLMutation<CreateModelFieldsMutation, CreateModelMutationVariables>;

export type CREATE_MODEL_FIELDS_MUTATION = typeof CREATE_MODEL_FIELDS_MUTATION;
