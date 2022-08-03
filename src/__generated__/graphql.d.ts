/**
 * ======================================================
 * THIS IS A GENERATED FILE! You shouldn't edit it manually. Regenerate it using `yarn generate-graphql`.
 * ======================================================
 */

export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  /** A date string, such as 2007-12-03, compliant with the `full-date` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  Date: any;
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  DateTime: any;
  JSON: { [key: string]: any };
};

export type CreateConnectionResult = {
  __typename?: 'CreateConnectionResult';
  connection?: Maybe<Scalars['JSON']>;
  error?: Maybe<Scalars['String']>;
  success: Scalars['Boolean'];
};

export type EnvironmentPatchResult = {
  __typename?: 'EnvironmentPatchResult';
  success: Scalars['Boolean'];
};

export type EnvironmentPublishResult = {
  __typename?: 'EnvironmentPublishResult';
  success: Scalars['Boolean'];
};

export type EnvironmentSubscriptionResult = {
  __typename?: 'EnvironmentSubscriptionResult';
  patches: Array<Scalars['JSON']>;
};

export type FileSyncChangedEvent = {
  __typename?: 'FileSyncChangedEvent';
  content: Scalars['String'];
  mode: Scalars['Float'];
  path: Scalars['String'];
};

export type FileSyncChangedEventInput = {
  content: Scalars['String'];
  mode: Scalars['Float'];
  path: Scalars['String'];
};

export type FileSyncDeletedEvent = {
  __typename?: 'FileSyncDeletedEvent';
  path: Scalars['String'];
};

export type FileSyncDeletedEventInput = {
  path: Scalars['String'];
};

export type GadgetRole = {
  __typename?: 'GadgetRole';
  key: Scalars['String'];
  name: Scalars['String'];
  order: Scalars['Int'];
  selectable: Scalars['Boolean'];
};

export type LogSearchResult = {
  __typename?: 'LogSearchResult';
  data: Scalars['JSON'];
  status: Scalars['String'];
};

export type Mutation = {
  __typename?: 'Mutation';
  createSendGridConnection?: Maybe<CreateConnectionResult>;
  createTwilioConnection?: Maybe<CreateConnectionResult>;
  patchEnvironmentTree?: Maybe<EnvironmentPatchResult>;
  publish?: Maybe<EnvironmentPublishResult>;
  publishFileSyncEvents: PublishFileSyncEventsResult;
  registerWebhooks?: Maybe<RegisterWebhooksResult>;
  unregisterWebhooks?: Maybe<RegisterWebhooksResult>;
};


export type MutationCreateSendGridConnectionArgs = {
  secrets: Scalars['JSON'];
};


export type MutationCreateTwilioConnectionArgs = {
  secrets: Scalars['JSON'];
};


export type MutationPatchEnvironmentTreeArgs = {
  clientID: Scalars['String'];
  patches: Array<Scalars['JSON']>;
};


export type MutationPublishFileSyncEventsArgs = {
  input: PublishFileSyncEventsInput;
};


export type MutationRegisterWebhooksArgs = {
  keepExtraTopics?: InputMaybe<Scalars['Boolean']>;
  modelKeys?: InputMaybe<Array<Scalars['String']>>;
  shopIds?: InputMaybe<Array<Scalars['String']>>;
};


export type MutationUnregisterWebhooksArgs = {
  modelKeys?: InputMaybe<Array<Scalars['String']>>;
  shopIds?: InputMaybe<Array<Scalars['String']>>;
};

export type PublishFileSyncEventsInput = {
  changed: Array<FileSyncChangedEventInput>;
  deleted: Array<FileSyncDeletedEventInput>;
  expectedRemoteFilesVersion: Scalars['String'];
};

export type PublishFileSyncEventsResult = {
  __typename?: 'PublishFileSyncEventsResult';
  remoteFilesVersion: Scalars['String'];
};

export type Query = {
  __typename?: 'Query';
  currentUser: User;
  environmentTreePath?: Maybe<Scalars['JSON']>;
  logsSearch: LogSearchResult;
  remoteFilesVersion: Scalars['String'];
  roles: Array<GadgetRole>;
  runTestSupportFunction?: Maybe<Scalars['JSON']>;
  typesManifest: TypesManifest;
};


export type QueryEnvironmentTreePathArgs = {
  path: Scalars['String'];
};


export type QueryLogsSearchArgs = {
  direction?: InputMaybe<Scalars['String']>;
  end?: InputMaybe<Scalars['DateTime']>;
  limit?: InputMaybe<Scalars['Int']>;
  query: Scalars['String'];
  start?: InputMaybe<Scalars['DateTime']>;
  step?: InputMaybe<Scalars['Int']>;
};

export type RegisterWebhooksResult = {
  __typename?: 'RegisterWebhooksResult';
  success: Scalars['Boolean'];
};

export type RemoteFileSyncEvents = {
  __typename?: 'RemoteFileSyncEvents';
  changed: Array<FileSyncChangedEvent>;
  deleted: Array<FileSyncDeletedEvent>;
  remoteFilesVersion: Scalars['String'];
};

export type Subscription = {
  __typename?: 'Subscription';
  editorActive?: Maybe<Scalars['Boolean']>;
  environmentTreePathPatches?: Maybe<EnvironmentSubscriptionResult>;
  logsSearch: LogSearchResult;
  remoteFileSyncEvents: RemoteFileSyncEvents;
  typesManifestStream: TypesManifest;
};


export type SubscriptionEnvironmentTreePathPatchesArgs = {
  clientID: Scalars['String'];
  path: Scalars['String'];
};


export type SubscriptionLogsSearchArgs = {
  limit?: InputMaybe<Scalars['Int']>;
  query: Scalars['String'];
  start?: InputMaybe<Scalars['DateTime']>;
};


export type SubscriptionRemoteFileSyncEventsArgs = {
  localFilesVersion: Scalars['String'];
};

export type TypeManifestEntry = {
  __typename?: 'TypeManifestEntry';
  declaration: Scalars['String'];
  path: Scalars['String'];
};

export type TypesManifest = {
  __typename?: 'TypesManifest';
  dependenciesHash: Scalars['String'];
  entries: Array<TypeManifestEntry>;
  environmentVersion: Scalars['Int'];
};

export type User = {
  __typename?: 'User';
  email: Scalars['String'];
  name?: Maybe<Scalars['String']>;
};

export type RemoteFileSyncEventsSubscriptionVariables = Exact<{
  localFilesVersion: Scalars['String'];
}>;


export type RemoteFileSyncEventsSubscription = { __typename?: 'Subscription', remoteFileSyncEvents: { __typename?: 'RemoteFileSyncEvents', remoteFilesVersion: string, changed: Array<{ __typename?: 'FileSyncChangedEvent', path: string, mode: number, content: string }>, deleted: Array<{ __typename?: 'FileSyncDeletedEvent', path: string }> } };

export type RemoteFilesVersionQueryVariables = Exact<{ [key: string]: never; }>;


export type RemoteFilesVersionQuery = { __typename?: 'Query', remoteFilesVersion: string };

export type PublishFileSyncEventsMutationVariables = Exact<{
  input: PublishFileSyncEventsInput;
}>;


export type PublishFileSyncEventsMutation = { __typename?: 'Mutation', publishFileSyncEvents: { __typename?: 'PublishFileSyncEventsResult', remoteFilesVersion: string } };
