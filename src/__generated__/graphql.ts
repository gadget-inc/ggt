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
  ID: { input: string; output: string; }
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

export type AddApplicationTagResult = {
  __typename?: 'AddApplicationTagResult';
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type AddUserTagResult = {
  __typename?: 'AddUserTagResult';
  reason?: Maybe<Scalars['String']['output']>;
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

export type FileSyncComparisonHashes = {
  __typename?: 'FileSyncComparisonHashes';
  filesVersionHashes: FileSyncHashes;
  latestFilesVersionHashes: FileSyncHashes;
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

export type FileSyncFile = {
  __typename?: 'FileSyncFile';
  content: Scalars['String']['output'];
  encoding: FileSyncEncoding;
  mode: Scalars['Float']['output'];
  path: Scalars['String']['output'];
};

export type FileSyncFiles = {
  __typename?: 'FileSyncFiles';
  files: Array<FileSyncFile>;
  filesVersion: Scalars['String']['output'];
};

export type FileSyncHashes = {
  __typename?: 'FileSyncHashes';
  filesVersion: Scalars['String']['output'];
  hashes: Scalars['JSON']['output'];
};

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

export type MigrateAacResult = {
  __typename?: 'MigrateAACResult';
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type MigrateEnvironmentsResult = {
  __typename?: 'MigrateEnvironmentsResult';
  success: Scalars['Boolean']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  addApplicationTag?: Maybe<AddApplicationTagResult>;
  addUserTag?: Maybe<AddUserTagResult>;
  changeAppDomain?: Maybe<ChangeAppDomainResult>;
  convergePackages: Scalars['Boolean']['output'];
  deleteApp?: Maybe<DeleteAppStatusResult>;
  enableFrontend?: Maybe<EnableFrontendResult>;
  migrateAAC?: Maybe<MigrateAacResult>;
  migrateEnvironments?: Maybe<MigrateEnvironmentsResult>;
  patchEnvironmentTree?: Maybe<EnvironmentPatchResult>;
  publish?: Maybe<EnvironmentPublishResult>;
  publishFileSyncEvents: PublishFileSyncEventsResult;
  refreshScopes?: Maybe<RefreshScopesResult>;
  registerWebhooks?: Maybe<RegisterWebhooksResult>;
  /** @deprecated use team */
  removeContributor?: Maybe<RemoveContributorResult>;
  /** @deprecated app invitations are no longer supported */
  sendAppInvitation?: Maybe<SendAppInvitationResult>;
  setClientCurrentPath: EnvironmentPatchResult;
  setFrameworkVersion: SetFrameworkVersionResult;
  syncToWebflow: Scalars['Boolean']['output'];
  uninstallShop?: Maybe<UninstallShopResult>;
  unregisterWebhooks?: Maybe<UnregisterWebhooksResult>;
  uploadFiles: UploadFilesResult;
  uploadTemplateAsset: UploadTemplateAssetResult;
};


export type MutationAddApplicationTagArgs = {
  tag: Scalars['String']['input'];
};


export type MutationAddUserTagArgs = {
  replaceMatches?: InputMaybe<Array<Scalars['String']['input']>>;
  tag: Scalars['String']['input'];
};


export type MutationChangeAppDomainArgs = {
  newSubdomain: Scalars['String']['input'];
  onlyValidate?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationDeleteAppArgs = {
  onlyProduction?: InputMaybe<Scalars['Boolean']['input']>;
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


export type MutationSetClientCurrentPathArgs = {
  clientID: EnvironmentTreeClientId;
  currentPath: Scalars['String']['input'];
};


export type MutationSetFrameworkVersionArgs = {
  constraint: Scalars['String']['input'];
};


export type MutationUninstallShopArgs = {
  shopId: Scalars['String']['input'];
};


export type MutationUnregisterWebhooksArgs = {
  apiKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  connectionKey: Scalars['String']['input'];
  modelKeys?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type MutationUploadFilesArgs = {
  files: Array<UploadFile>;
};


export type MutationUploadTemplateAssetArgs = {
  file: Scalars['Upload']['input'];
};

export type Problem = {
  __typename?: 'Problem';
  level: Scalars['String']['output'];
  message: Scalars['String']['output'];
  path: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type PublishFileSyncEventsInput = {
  changed: Array<FileSyncChangedEventInput>;
  deleted: Array<FileSyncDeletedEventInput>;
  expectedRemoteFilesVersion: Scalars['String']['input'];
};

export type PublishFileSyncEventsResult = {
  __typename?: 'PublishFileSyncEventsResult';
  problems: Array<Problem>;
  remoteFilesVersion: Scalars['String']['output'];
};

export type PublishIssue = {
  __typename?: 'PublishIssue';
  message: Scalars['String']['output'];
  node?: Maybe<PublishIssueNode>;
  nodeLabels?: Maybe<Array<Maybe<PublishIssueNodeLabel>>>;
  severity: Scalars['String']['output'];
};

export type PublishIssueNode = {
  __typename?: 'PublishIssueNode';
  apiIdentifier?: Maybe<Scalars['String']['output']>;
  fieldType?: Maybe<Scalars['String']['output']>;
  key: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  parentApiIdentifier?: Maybe<Scalars['String']['output']>;
  parentKey?: Maybe<Scalars['String']['output']>;
  type: Scalars['String']['output'];
};

export type PublishIssueNodeLabel = {
  __typename?: 'PublishIssueNodeLabel';
  identifier?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

export type PublishStatus = {
  __typename?: 'PublishStatus';
  code?: Maybe<Scalars['String']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  output?: Maybe<Scalars['String']['output']>;
};

export type PublishStatusState = {
  __typename?: 'PublishStatusState';
  issues: Array<PublishIssue>;
  progress: Scalars['String']['output'];
  publishStarted: Scalars['Boolean']['output'];
  remoteFilesVersion: Scalars['String']['output'];
  status?: Maybe<PublishStatus>;
};

export type Query = {
  __typename?: 'Query';
  apiUpgradeConvergePlan?: Maybe<ApiUpgradeConvergePlanResult>;
  currentUser: User;
  environmentTreeChildKeys: Array<Scalars['String']['output']>;
  environmentTreePath?: Maybe<Scalars['JSON']['output']>;
  fileSyncComparisonHashes: FileSyncComparisonHashes;
  fileSyncFiles: FileSyncFiles;
  fileSyncHashes: FileSyncHashes;
  identifySupportConversation?: Maybe<IdentifySupportConversationResult>;
  /** @deprecated use team */
  listContributors: Array<ContributorResult>;
  logsSearch: LogSearchResult;
  publishIssues: Array<PublishIssue>;
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


export type QueryFileSyncComparisonHashesArgs = {
  filesVersion: Scalars['String']['input'];
};


export type QueryFileSyncFilesArgs = {
  encoding?: InputMaybe<FileSyncEncoding>;
  filesVersion?: InputMaybe<Scalars['String']['input']>;
  paths: Array<Scalars['String']['input']>;
};


export type QueryFileSyncHashesArgs = {
  filesVersion?: InputMaybe<Scalars['String']['input']>;
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
  environmentStatus?: InputMaybe<Scalars['String']['input']>;
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

export type SetFrameworkVersionResult = {
  __typename?: 'SetFrameworkVersionResult';
  installDependenciesOperationKey?: Maybe<Scalars['String']['output']>;
};

export type Subscription = {
  __typename?: 'Subscription';
  environmentTreePathPatches?: Maybe<EnvironmentSubscriptionResult>;
  logsSearch: LogSearchResult;
  publishStatus?: Maybe<PublishStatusState>;
  remoteFileSyncEvents: RemoteFileSyncEvents;
  reportClientPresence?: Maybe<Scalars['Boolean']['output']>;
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


export type SubscriptionPublishStatusArgs = {
  force?: InputMaybe<Scalars['Boolean']['input']>;
  localFilesVersion: Scalars['String']['input'];
};


export type SubscriptionRemoteFileSyncEventsArgs = {
  encoding?: InputMaybe<FileSyncEncoding>;
  localFilesVersion: Scalars['String']['input'];
};


export type SubscriptionReportClientPresenceArgs = {
  clientID: EnvironmentTreeClientId;
};

export type TeamEntitlements = {
  __typename?: 'TeamEntitlements';
  openAICredits?: Maybe<Scalars['Boolean']['output']>;
};

export type TeamMember = {
  __typename?: 'TeamMember';
  contributesToApp: Scalars['Boolean']['output'];
  email: Scalars['String']['output'];
};

export type TeamResult = {
  __typename?: 'TeamResult';
  availableSeats?: Maybe<Scalars['Int']['output']>;
  canPublish: Scalars['Boolean']['output'];
  costPerApplication?: Maybe<Scalars['String']['output']>;
  costPerSeat?: Maybe<Scalars['String']['output']>;
  includedApplications?: Maybe<Scalars['Int']['output']>;
  includedApplicationsRemaining?: Maybe<Scalars['Int']['output']>;
  maxApplications?: Maybe<Scalars['Int']['output']>;
  teamEntitlements: TeamEntitlements;
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

export type UninstallShopResult = {
  __typename?: 'UninstallShopResult';
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
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

export type UploadTemplateAssetResult = {
  __typename?: 'UploadTemplateAssetResult';
  success: Scalars['Boolean']['output'];
  url?: Maybe<Scalars['String']['output']>;
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


export type PublishFileSyncEventsMutation = { __typename?: 'Mutation', publishFileSyncEvents: { __typename?: 'PublishFileSyncEventsResult', remoteFilesVersion: string, problems: Array<{ __typename?: 'Problem', level: string, message: string, path: string, type: string }> } };

export type FileSyncFilesQueryVariables = Exact<{
  paths: Array<Scalars['String']['input']> | Scalars['String']['input'];
  filesVersion?: InputMaybe<Scalars['String']['input']>;
  encoding?: InputMaybe<FileSyncEncoding>;
}>;


export type FileSyncFilesQuery = { __typename?: 'Query', fileSyncFiles: { __typename?: 'FileSyncFiles', filesVersion: string, files: Array<{ __typename?: 'FileSyncFile', path: string, mode: number, content: string, encoding: FileSyncEncoding }> } };

export type FileSyncHashesQueryVariables = Exact<{
  filesVersion?: InputMaybe<Scalars['String']['input']>;
}>;


export type FileSyncHashesQuery = { __typename?: 'Query', fileSyncHashes: { __typename?: 'FileSyncHashes', filesVersion: string, hashes: { [key: string]: any } } };

export type FileSyncComparisonHashesQueryVariables = Exact<{
  filesVersion: Scalars['String']['input'];
}>;


export type FileSyncComparisonHashesQuery = { __typename?: 'Query', fileSyncComparisonHashes: { __typename?: 'FileSyncComparisonHashes', filesVersionHashes: { __typename?: 'FileSyncHashes', filesVersion: string, hashes: { [key: string]: any } }, latestFilesVersionHashes: { __typename?: 'FileSyncHashes', filesVersion: string, hashes: { [key: string]: any } } } };

export type PublishStatusSubscriptionVariables = Exact<{
  localFilesVersion: Scalars['String']['input'];
  force?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type PublishStatusSubscription = { __typename?: 'Subscription', publishStatus?: { __typename?: 'PublishStatusState', publishStarted: boolean, remoteFilesVersion: string, progress: string, issues: Array<{ __typename?: 'PublishIssue', severity: string, message: string, node?: { __typename?: 'PublishIssueNode', type: string, key: string, apiIdentifier?: string | null, name?: string | null, fieldType?: string | null, parentKey?: string | null, parentApiIdentifier?: string | null } | null, nodeLabels?: Array<{ __typename?: 'PublishIssueNodeLabel', type?: string | null, identifier?: string | null } | null> | null }>, status?: { __typename?: 'PublishStatus', code?: string | null, message?: string | null, output?: string | null } | null } | null };
