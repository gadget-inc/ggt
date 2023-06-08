/**
 * ======================================================
 * THIS IS A GENERATED FILE! DO NOT EDIT IT MANUALLY!
 *
 * You can regenerate it by running `npm run generate-graphql`.
 * ======================================================
 */

export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string | number; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** A date string, such as 2007-12-03, compliant with the `full-date` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  Date: { input: any; output: any; }
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  DateTime: { input: any; output: any; }
  JSON: { input: { [key: string]: any }; output: { [key: string]: any }; }
  /** The `Upload` scalar type represents a file upload. */
  Upload: { input: any; output: any; }
};

export type ApiUpgradeConvergePlanResult = {
  __typename?: 'APIUpgradeConvergePlanResult';
  items: Array<Scalars['JSON']['output']>;
  success: Scalars['Boolean']['output'];
};

export type ChangeAppDomainResult = {
  __typename?: 'ChangeAppDomainResult';
  onlyValidate?: Maybe<Scalars['Boolean']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type ContributorResult = {
  __typename?: 'ContributorResult';
  email: Scalars['String']['output'];
  isOwner: Scalars['Boolean']['output'];
  isPending: Scalars['Boolean']['output'];
};

export type DeleteAppStatusResult = {
  __typename?: 'DeleteAppStatusResult';
  isNotCreator?: Maybe<Scalars['Boolean']['output']>;
  isNotOwner?: Maybe<Scalars['Boolean']['output']>;
  success: Scalars['Boolean']['output'];
};

export type EnableFrontendResult = {
  __typename?: 'EnableFrontendResult';
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type EnvironmentPatchResult = {
  __typename?: 'EnvironmentPatchResult';
  success: Scalars['Boolean']['output'];
};

export type EnvironmentPublishResult = {
  __typename?: 'EnvironmentPublishResult';
  success: Scalars['Boolean']['output'];
};

export type EnvironmentSubscriptionResult = {
  __typename?: 'EnvironmentSubscriptionResult';
  patches: Array<Scalars['JSON']['output']>;
};

export type EnvironmentTreeClientId = {
  clientType: Scalars['String']['input'];
  id: Scalars['String']['input'];
};

export type FileSyncChangedEvent = {
  __typename?: 'FileSyncChangedEvent';
  content: Scalars['String']['output'];
  encoding: FileSyncEncoding;
  mode: Scalars['Float']['output'];
  path: Scalars['String']['output'];
};

export type FileSyncChangedEventInput = {
  content: Scalars['String']['input'];
  encoding?: InputMaybe<FileSyncEncoding>;
  mode: Scalars['Float']['input'];
  oldPath?: InputMaybe<Scalars['String']['input']>;
  path: Scalars['String']['input'];
};

export type FileSyncDeletedEvent = {
  __typename?: 'FileSyncDeletedEvent';
  path: Scalars['String']['output'];
};

export type FileSyncDeletedEventInput = {
  path: Scalars['String']['input'];
};

export enum FileSyncEncoding {
  Base64 = 'base64',
  Utf8 = 'utf8'
}

export type GadgetRole = {
  __typename?: 'GadgetRole';
  key: Scalars['String']['output'];
  name: Scalars['String']['output'];
  order: Scalars['Int']['output'];
  selectable: Scalars['Boolean']['output'];
};

export type IdentifySupportConversationResult = {
  __typename?: 'IdentifySupportConversationResult';
  identificationEmail: Scalars['String']['output'];
  identificationToken: Scalars['String']['output'];
};

export type LogSearchResult = {
  __typename?: 'LogSearchResult';
  data: Scalars['JSON']['output'];
  status: Scalars['String']['output'];
};

export type MigrateEnvironmentsResult = {
  __typename?: 'MigrateEnvironmentsResult';
  success: Scalars['Boolean']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  changeAppDomain?: Maybe<ChangeAppDomainResult>;
  deleteApp?: Maybe<DeleteAppStatusResult>;
  enableFrontend?: Maybe<EnableFrontendResult>;
  migrateEnvironments?: Maybe<MigrateEnvironmentsResult>;
  patchEnvironmentTree?: Maybe<EnvironmentPatchResult>;
  publish?: Maybe<EnvironmentPublishResult>;
  publishFileSyncEvents: PublishFileSyncEventsResult;
  refreshScopes?: Maybe<RefreshScopesResult>;
  registerWebhooks?: Maybe<RegisterWebhooksResult>;
  removeContributor?: Maybe<RemoveContributorResult>;
  sendAppInvitation?: Maybe<SendAppInvitationResult>;
  unregisterWebhooks?: Maybe<UnregisterWebhooksResult>;
  uploadFiles: UploadFilesResult;
};


export type MutationChangeAppDomainArgs = {
  newSubdomain: Scalars['String']['input'];
  onlyValidate?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationEnableFrontendArgs = {
  hasShopifyConnection: Scalars['Boolean']['input'];
};


export type MutationMigrateEnvironmentsArgs = {
  existingToProduction: Scalars['Boolean']['input'];
};


export type MutationPatchEnvironmentTreeArgs = {
  clientID: EnvironmentTreeClientId;
  patches: Array<Scalars['JSON']['input']>;
};


export type MutationPublishFileSyncEventsArgs = {
  input: PublishFileSyncEventsInput;
};


export type MutationRefreshScopesArgs = {
  appConfigKey: Scalars['String']['input'];
  connectionKey: Scalars['String']['input'];
  shopId: Scalars['String']['input'];
};


export type MutationRegisterWebhooksArgs = {
  connectionKey: Scalars['String']['input'];
  keepExtraTopics?: InputMaybe<Scalars['Boolean']['input']>;
  modelKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  shopIds: Array<Scalars['String']['input']>;
};


export type MutationRemoveContributorArgs = {
  email: Scalars['String']['input'];
  isInvitation: Scalars['Boolean']['input'];
};


export type MutationSendAppInvitationArgs = {
  email?: InputMaybe<Scalars['String']['input']>;
  emails?: InputMaybe<Array<Scalars['String']['input']>>;
  resend?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationUnregisterWebhooksArgs = {
  apiKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  connectionKey: Scalars['String']['input'];
  modelKeys?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type MutationUploadFilesArgs = {
  files: Array<UploadFile>;
};

export type PublishFileSyncEventsInput = {
  changed: Array<FileSyncChangedEventInput>;
  deleted: Array<FileSyncDeletedEventInput>;
  expectedRemoteFilesVersion: Scalars['String']['input'];
};

export type PublishFileSyncEventsResult = {
  __typename?: 'PublishFileSyncEventsResult';
  remoteFilesVersion: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  apiUpgradeConvergePlan?: Maybe<ApiUpgradeConvergePlanResult>;
  currentUser: User;
  environmentTreeChildKeys: Array<Scalars['String']['output']>;
  environmentTreePath?: Maybe<Scalars['JSON']['output']>;
  identifySupportConversation?: Maybe<IdentifySupportConversationResult>;
  listContributors: Array<ContributorResult>;
  logsSearch: LogSearchResult;
  remoteFilesVersion: Scalars['String']['output'];
  roles: Array<GadgetRole>;
  runTestSupportFunction?: Maybe<Scalars['JSON']['output']>;
  team: TeamResult;
  typesManifest: TypesManifest;
};


export type QueryApiUpgradeConvergePlanArgs = {
  currentVersion: Scalars['String']['input'];
  targetVersion: Scalars['String']['input'];
};


export type QueryEnvironmentTreeChildKeysArgs = {
  path: Scalars['String']['input'];
};


export type QueryEnvironmentTreePathArgs = {
  hydrateChildrenGlobs?: InputMaybe<Array<Scalars['String']['input']>>;
  path: Scalars['String']['input'];
};


export type QueryLogsSearchArgs = {
  direction?: InputMaybe<Scalars['String']['input']>;
  end?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  query: Scalars['String']['input'];
  start?: InputMaybe<Scalars['DateTime']['input']>;
  step?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryTypesManifestArgs = {
  dependenciesHash: Scalars['String']['input'];
};

export type RefreshScopesResult = {
  __typename?: 'RefreshScopesResult';
  success: Scalars['Boolean']['output'];
};

export type RegisterWebhooksResult = {
  __typename?: 'RegisterWebhooksResult';
  success: Scalars['Boolean']['output'];
};

export type RemoteFileSyncEvents = {
  __typename?: 'RemoteFileSyncEvents';
  changed: Array<FileSyncChangedEvent>;
  deleted: Array<FileSyncDeletedEvent>;
  remoteFilesVersion: Scalars['String']['output'];
};

export type RemoveContributorResult = {
  __typename?: 'RemoveContributorResult';
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type SendAppInvitationResult = {
  __typename?: 'SendAppInvitationResult';
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type Subscription = {
  __typename?: 'Subscription';
  editorActive?: Maybe<Scalars['Boolean']['output']>;
  environmentTreePathPatches?: Maybe<EnvironmentSubscriptionResult>;
  logsSearch: LogSearchResult;
  remoteFileSyncEvents: RemoteFileSyncEvents;
  typesManifestStream: TypesManifest;
};


export type SubscriptionEnvironmentTreePathPatchesArgs = {
  clientID: EnvironmentTreeClientId;
  path: Scalars['String']['input'];
};


export type SubscriptionLogsSearchArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  query: Scalars['String']['input'];
  start?: InputMaybe<Scalars['DateTime']['input']>;
};


export type SubscriptionRemoteFileSyncEventsArgs = {
  encoding?: InputMaybe<FileSyncEncoding>;
  localFilesVersion: Scalars['String']['input'];
};

export type TeamMember = {
  __typename?: 'TeamMember';
  contributesToApp: Scalars['Boolean']['output'];
  email: Scalars['String']['output'];
};

export type TeamResult = {
  __typename?: 'TeamResult';
  availableSeats?: Maybe<Scalars['Int']['output']>;
  costPerSeat?: Maybe<Scalars['String']['output']>;
  teamMembers: Array<TeamMember>;
};

export type TypeManifestEntry = {
  __typename?: 'TypeManifestEntry';
  declaration: Scalars['String']['output'];
  path: Scalars['String']['output'];
};

export type TypesManifest = {
  __typename?: 'TypesManifest';
  cdn: Array<Scalars['String']['output']>;
  dependenciesHash: Scalars['String']['output'];
  entries: Array<TypeManifestEntry>;
  environmentVersion: Scalars['Int']['output'];
};

export type UnregisterWebhooksResult = {
  __typename?: 'UnregisterWebhooksResult';
  success: Scalars['Boolean']['output'];
};

export type UploadFile = {
  file: Scalars['Upload']['input'];
  path: Scalars['String']['input'];
};

export type UploadFilesResult = {
  __typename?: 'UploadFilesResult';
  success: Scalars['Boolean']['output'];
};

export type User = {
  __typename?: 'User';
  email: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
};

export type RemoteFileSyncEventsSubscriptionVariables = Exact<{
  localFilesVersion: Scalars['String']['input'];
}>;


export type RemoteFileSyncEventsSubscription = { __typename?: 'Subscription', remoteFileSyncEvents: { __typename?: 'RemoteFileSyncEvents', remoteFilesVersion: string, changed: Array<{ __typename?: 'FileSyncChangedEvent', path: string, mode: number, content: string, encoding: FileSyncEncoding }>, deleted: Array<{ __typename?: 'FileSyncDeletedEvent', path: string }> } };

export type RemoteFilesVersionQueryVariables = Exact<{ [key: string]: never; }>;


export type RemoteFilesVersionQuery = { __typename?: 'Query', remoteFilesVersion: string };

export type PublishFileSyncEventsMutationVariables = Exact<{
  input: PublishFileSyncEventsInput;
}>;


export type PublishFileSyncEventsMutation = { __typename?: 'Mutation', publishFileSyncEvents: { __typename?: 'PublishFileSyncEventsResult', remoteFilesVersion: string } };
