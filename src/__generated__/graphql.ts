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
  /** The ID of a record in Gadget */
  GadgetID: { input: any; output: any; }
  /** Instructions for a client to turn raw transport types (like strings) into useful client side types (like Dates). Unstable and not intended for developer use. */
  HydrationPlan: { input: any; output: any; }
  /** Represents one session result record in internal api calls. Returns a JSON blob of all the record's fields. */
  InternalSessionRecord: { input: any; output: any; }
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: { [key: string]: any }; output: { [key: string]: any }; }
  /** The `JSONObject` scalar type represents JSON objects as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSONObject: { input: any; output: any; }
  /** Represents the state of one record in a Gadget database. Represented as either a string or set of strings nested in objects. */
  RecordState: { input: any; output: any; }
  /** The `Upload` scalar type represents a file upload. */
  Upload: { input: any; output: any; }
};

export type ApiUpgradeConvergePlanResult = {
  __typename?: 'APIUpgradeConvergePlanResult';
  items: Array<Scalars['JSON']['output']>;
  success: Scalars['Boolean']['output'];
};

export type AccessToken = {
  __typename?: 'AccessToken';
  createdAt: Scalars['DateTime']['output'];
  creator: PlatformAccessTokenUser;
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  tokenPrefix: Scalars['String']['output'];
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

export type AppDomain = {
  __typename?: 'AppDomain';
  environmentType: Scalars['String']['output'];
  host: Scalars['String']['output'];
  isPrimary: Scalars['Boolean']['output'];
};

export type BackgroundAction = {
  __typename?: 'BackgroundAction';
  actionApiIdentifier: Scalars['String']['output'];
  attempts: Array<BackgroundActionAttempt>;
  cancelledAt?: Maybe<Scalars['DateTime']['output']>;
  createdDate: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  lastAttemptFinishedAt?: Maybe<Scalars['DateTime']['output']>;
  lastAttemptStartedAt?: Maybe<Scalars['DateTime']['output']>;
  lastRestartedAt?: Maybe<Scalars['DateTime']['output']>;
  nextAttemptStartsAfter?: Maybe<Scalars['DateTime']['output']>;
  payload: Scalars['JSON']['output'];
  priority: Scalars['String']['output'];
  queue?: Maybe<Scalars['String']['output']>;
  result?: Maybe<Scalars['JSON']['output']>;
  retryPolicy: Scalars['JSON']['output'];
  state: BackgroundActionState;
  type: Scalars['String']['output'];
};

export type BackgroundActionAttempt = {
  __typename?: 'BackgroundActionAttempt';
  attemptNumber: Scalars['Int']['output'];
  createdDate?: Maybe<Scalars['DateTime']['output']>;
  details: Scalars['JSON']['output'];
  failureReason?: Maybe<Scalars['JSON']['output']>;
  failureSummary?: Maybe<Scalars['String']['output']>;
  finishedDate?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['String']['output'];
  startedDate?: Maybe<Scalars['DateTime']['output']>;
  state: BackgroundActionAttemptState;
};

export enum BackgroundActionAttemptState {
  Failed = 'FAILED',
  Running = 'RUNNING',
  Succeeded = 'SUCCEEDED'
}

export type BackgroundActionBulkResult = {
  __typename?: 'BackgroundActionBulkResult';
  failedCount: Scalars['Int']['output'];
  successCount: Scalars['Int']['output'];
};

export type BackgroundActionConnection = {
  __typename?: 'BackgroundActionConnection';
  nodes: Array<BackgroundAction>;
  pageInfo: OffsetPageInfo;
};

export type BackgroundActionFilter = {
  inState?: InputMaybe<Array<BackgroundActionState>>;
  priority?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export enum BackgroundActionState {
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  Retrying = 'RETRYING',
  Running = 'RUNNING',
  Scheduled = 'SCHEDULED',
  Waiting = 'WAITING'
}

export type ChangeAppDomainResult = {
  __typename?: 'ChangeAppDomainResult';
  onlyValidate?: Maybe<Scalars['Boolean']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type ChangeEnvironmentSlugResult = {
  __typename?: 'ChangeEnvironmentSlugResult';
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

export type CreateModelFieldsInput = {
  fieldType: Scalars['String']['input'];
  name: Scalars['String']['input'];
};

export type CreateModelInput = {
  fields: Array<CreateModelFieldsInput>;
  path: Scalars['String']['input'];
};

export type DeleteAppStatusResult = {
  __typename?: 'DeleteAppStatusResult';
  isNotCreator?: Maybe<Scalars['Boolean']['output']>;
  isNotOwner?: Maybe<Scalars['Boolean']['output']>;
  success: Scalars['Boolean']['output'];
};

export type DeletedModelField = {
  __typename?: 'DeletedModelField';
  fields: Array<Scalars['String']['output']>;
  modelIdentifier: Scalars['String']['output'];
};

export type DeletedModelsAndFields = {
  __typename?: 'DeletedModelsAndFields';
  deletedModelFields: Array<DeletedModelField>;
  deletedModels: Array<Scalars['String']['output']>;
};

/** One upload target to use for the Direct Upload style of sending files to Gadget */
export type DirectUploadToken = {
  __typename?: 'DirectUploadToken';
  /** The token to pass to an action to reference the uploaded file. */
  token: Scalars['String']['output'];
  /** The URL to upload a file to. */
  url: Scalars['String']['output'];
};

export type EnableFrontendResult = {
  __typename?: 'EnableFrontendResult';
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type Environment = {
  __typename?: 'Environment';
  id: Scalars['String']['output'];
  lastUserEditDate: Scalars['DateTime']['output'];
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  status: EnvironmentStatus;
  type: EnvironmentType;
};

export type EnvironmentInput = {
  slug: Scalars['String']['input'];
  sourceSlug?: InputMaybe<Scalars['String']['input']>;
};

export type EnvironmentPatchResult = {
  __typename?: 'EnvironmentPatchResult';
  success: Scalars['Boolean']['output'];
};

export type EnvironmentPublishResult = {
  __typename?: 'EnvironmentPublishResult';
  success: Scalars['Boolean']['output'];
};

export enum EnvironmentStatus {
  Active = 'ACTIVE',
  FatalError = 'FATAL_ERROR',
  Paused = 'PAUSED',
  Pending = 'PENDING'
}

export type EnvironmentSubscriptionResult = {
  __typename?: 'EnvironmentSubscriptionResult';
  patches: Array<Scalars['JSON']['output']>;
};

export type EnvironmentTreeClientId = {
  clientType: Scalars['String']['input'];
  id: Scalars['String']['input'];
};

export enum EnvironmentType {
  Development = 'DEVELOPMENT',
  Production = 'PRODUCTION',
  Test = 'TEST'
}

export type ExecutionError = {
  /** The Gadget platform error code for this error. */
  code: Scalars['String']['output'];
  /** The human facing error message for this error. */
  message: Scalars['String']['output'];
  /** The stack for any exception that caused the error. Only available for super users. */
  stack?: Maybe<Scalars['String']['output']>;
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

export type GadgetAction = {
  __typename?: 'GadgetAction';
  acceptsInput: Scalars['Boolean']['output'];
  apiIdentifier: Scalars['String']['output'];
  availableInBulk: Scalars['Boolean']['output'];
  bulkApiIdentifier?: Maybe<Scalars['String']['output']>;
  bulkInvokedByIDOnly: Scalars['Boolean']['output'];
  examples?: Maybe<GadgetActionGraphQlType>;
  hasAmbiguousIdentifier: Scalars['Boolean']['output'];
  /** @deprecated This field will be removed. Use `isCreateOrUpdateAction` instead. */
  hasCreateOrUpdateEffect: Scalars['Boolean']['output'];
  /** @deprecated This field will be removed. Use `isDeleteAction` instead. */
  hasDeleteRecordEffect: Scalars['Boolean']['output'];
  inputFields: Array<GadgetObjectField>;
  isCreateOrUpdateAction: Scalars['Boolean']['output'];
  isDeleteAction: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  operatesWithRecordIdentity: Scalars['Boolean']['output'];
  possibleTransitions: Scalars['JSONObject']['output'];
  requiresInput: Scalars['Boolean']['output'];
  triggers?: Maybe<Array<GadgetTrigger>>;
};

export type GadgetActionGraphQlType = {
  __typename?: 'GadgetActionGraphQLType';
  bulkOutputGraphQLTypeSDL?: Maybe<Scalars['String']['output']>;
  exampleBulkGraphQLMutation?: Maybe<Scalars['String']['output']>;
  exampleBulkGraphQLVariables?: Maybe<Scalars['JSON']['output']>;
  exampleBulkImperativeInvocation?: Maybe<Scalars['String']['output']>;
  /** @deprecated moved to exampleBulkGraphQLMutation */
  exampleBulkMutation?: Maybe<Scalars['String']['output']>;
  exampleBulkReactHook?: Maybe<Scalars['String']['output']>;
  exampleGraphQLMutation: Scalars['String']['output'];
  exampleGraphQLVariables: Scalars['JSON']['output'];
  exampleImperativeInvocation: Scalars['String']['output'];
  exampleJSInputs: Scalars['JSON']['output'];
  /** @deprecated moved to exampleGraphQLMutation */
  exampleMutation: Scalars['String']['output'];
  exampleReactHook: Scalars['String']['output'];
  inputGraphQLTypeSDL?: Maybe<Scalars['String']['output']>;
  inputTypeScriptInterface?: Maybe<Scalars['String']['output']>;
  outputGraphQLTypeSDL: Scalars['String']['output'];
  outputTypeScriptInterface: Scalars['String']['output'];
};

export type GadgetApplicationMeta = {
  __typename?: 'GadgetApplicationMeta';
  allHydrations: Scalars['JSON']['output'];
  /** The roles that the entity making this API call has been assigned */
  assignedRoles: Array<GadgetRole>;
  canonicalRenderURL: Scalars['String']['output'];
  developmentGraphQLEndpoint: Scalars['String']['output'];
  developmentRenderURL: Scalars['String']['output'];
  directUploadToken?: Maybe<DirectUploadToken>;
  editURL: Scalars['String']['output'];
  environmentID: Scalars['GadgetID']['output'];
  environmentName: Scalars['String']['output'];
  environmentSlug: Scalars['String']['output'];
  firstModelForExamples: GadgetModel;
  globalActions: Array<GadgetGlobalAction>;
  graphQLEndpoint: Scalars['String']['output'];
  hasGlobalActions: Scalars['Boolean']['output'];
  hasLegacyEffectCards: Scalars['Boolean']['output'];
  hasShopifyConnection: Scalars['Boolean']['output'];
  hasSplitEnvironments: Scalars['Boolean']['output'];
  hydrations?: Maybe<Scalars['HydrationPlan']['output']>;
  id: Scalars['GadgetID']['output'];
  jsPackageIdentifier: Scalars['String']['output'];
  jsPackageTarballURL: Scalars['String']['output'];
  model?: Maybe<GadgetModel>;
  models: Array<GadgetModel>;
  name: Scalars['String']['output'];
  productionGraphQLEndpoint: Scalars['String']['output'];
  productionRenderURL: Scalars['String']['output'];
  referencedHydrations: Scalars['JSON']['output'];
  roles: Array<GadgetRole>;
  /** @deprecated The current session is available as the root field `currentSession` on the root Query object, which has the ID as well as other attributes of the session. */
  sessionID?: Maybe<Scalars['String']['output']>;
  shopifyConnectionApiVersion?: Maybe<Scalars['String']['output']>;
  slug: Scalars['String']['output'];
};


export type GadgetApplicationMetaDirectUploadTokenArgs = {
  nonce?: InputMaybe<Scalars['String']['input']>;
};


export type GadgetApplicationMetaHydrationsArgs = {
  modelName: Scalars['String']['input'];
};


export type GadgetApplicationMetaModelArgs = {
  apiIdentifier?: InputMaybe<Scalars['String']['input']>;
  key?: InputMaybe<Scalars['String']['input']>;
};

export type GadgetBelongsToConfig = GadgetFieldConfigInterface & {
  __typename?: 'GadgetBelongsToConfig';
  fieldType: GadgetFieldType;
  isConfigured: Scalars['Boolean']['output'];
  isInverseConfigured: Scalars['Boolean']['output'];
  relatedModel?: Maybe<GadgetModel>;
  relatedModelKey?: Maybe<Scalars['String']['output']>;
};

export type GadgetDateTimeConfig = GadgetFieldConfigInterface & {
  __typename?: 'GadgetDateTimeConfig';
  fieldType: GadgetFieldType;
  includeTime: Scalars['Boolean']['output'];
};

export type GadgetEnumConfig = GadgetFieldConfigInterface & {
  __typename?: 'GadgetEnumConfig';
  allowMultiple: Scalars['Boolean']['output'];
  allowOther: Scalars['Boolean']['output'];
  fieldType: GadgetFieldType;
  options: Array<GadgetEnumOption>;
};

export type GadgetEnumOption = {
  __typename?: 'GadgetEnumOption';
  color: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type GadgetField = {
  apiIdentifier: Scalars['String']['output'];
  configuration: GadgetFieldConfigInterface;
  fieldType: GadgetFieldType;
  hasDefault: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  required: Scalars['Boolean']['output'];
  requiredArgumentForInput: Scalars['Boolean']['output'];
};

/** The common bits that all field configuration types share */
export type GadgetFieldConfigInterface = {
  fieldType: GadgetFieldType;
};

/** The type of a given field of a model or other in-transit object within Gadget's type system */
export enum GadgetFieldType {
  Any = 'Any',
  Array = 'Array',
  BelongsTo = 'BelongsTo',
  Boolean = 'Boolean',
  Code = 'Code',
  Color = 'Color',
  Computed = 'Computed',
  DateTime = 'DateTime',
  Email = 'Email',
  EncryptedString = 'EncryptedString',
  Enum = 'Enum',
  File = 'File',
  HasMany = 'HasMany',
  HasManyThrough = 'HasManyThrough',
  HasOne = 'HasOne',
  Id = 'ID',
  Json = 'JSON',
  Money = 'Money',
  Null = 'Null',
  Number = 'Number',
  Object = 'Object',
  Password = 'Password',
  RecordState = 'RecordState',
  RichText = 'RichText',
  RoleAssignments = 'RoleAssignments',
  String = 'String',
  Url = 'URL',
  Vector = 'Vector'
}

export type GadgetFieldUsageExample = {
  __typename?: 'GadgetFieldUsageExample';
  exampleGraphQLMutation: Scalars['String']['output'];
  exampleGraphQLVariables: Scalars['JSON']['output'];
  exampleImperativeInvocation: Scalars['String']['output'];
  exampleReactHook: Scalars['String']['output'];
};

export type GadgetGenericFieldConfig = GadgetFieldConfigInterface & {
  __typename?: 'GadgetGenericFieldConfig';
  fieldType: GadgetFieldType;
};

export type GadgetGlobalAction = {
  __typename?: 'GadgetGlobalAction';
  acceptsInput: Scalars['Boolean']['output'];
  apiIdentifier: Scalars['String']['output'];
  examples?: Maybe<GadgetGlobalActionGraphQlType>;
  name: Scalars['String']['output'];
  namespace?: Maybe<Array<Scalars['String']['output']>>;
  requiresInput: Scalars['Boolean']['output'];
  triggers?: Maybe<Array<GadgetTrigger>>;
};

export type GadgetGlobalActionGraphQlType = {
  __typename?: 'GadgetGlobalActionGraphQLType';
  exampleGraphQLMutation: Scalars['String']['output'];
  exampleGraphQLVariables: Scalars['JSON']['output'];
  exampleImperativeInvocation: Scalars['String']['output'];
  exampleJSInputs: Scalars['JSON']['output'];
  /** @deprecated moved to exampleGraphQLMutation */
  exampleMutation: Scalars['String']['output'];
  exampleReactHook: Scalars['String']['output'];
  inputGraphQLTypeSDL?: Maybe<Scalars['String']['output']>;
  inputTypeScriptInterface?: Maybe<Scalars['String']['output']>;
  outputGraphQLTypeSDL: Scalars['String']['output'];
  outputTypeScriptInterface: Scalars['String']['output'];
};

export type GadgetHasManyConfig = GadgetFieldConfigInterface & {
  __typename?: 'GadgetHasManyConfig';
  fieldType: GadgetFieldType;
  isConfigured: Scalars['Boolean']['output'];
  isInverseConfigured: Scalars['Boolean']['output'];
  relatedModel?: Maybe<GadgetModel>;
  relatedModelKey?: Maybe<Scalars['String']['output']>;
};

export type GadgetModel = {
  __typename?: 'GadgetModel';
  action?: Maybe<GadgetAction>;
  actions: Array<GadgetAction>;
  apiIdentifier: Scalars['String']['output'];
  currentSingletonApiIdentifier?: Maybe<Scalars['String']['output']>;
  exampleFilterQuery: Scalars['String']['output'];
  exampleFindMostRecentlyCreatedQuery: Scalars['String']['output'];
  exampleFullFindFirstQuery: Scalars['String']['output'];
  exampleFullFindManyQuery: Scalars['String']['output'];
  exampleFullFindOneQuery: Scalars['String']['output'];
  exampleInternalBulkCreateMutation: Scalars['String']['output'];
  exampleInternalCreateMutation: Scalars['String']['output'];
  exampleInternalDeleteManyMutation: Scalars['String']['output'];
  exampleInternalDeleteMutation: Scalars['String']['output'];
  exampleInternalFindFirstQuery: Scalars['String']['output'];
  exampleInternalFindManyQuery: Scalars['String']['output'];
  exampleInternalFindOneQuery: Scalars['String']['output'];
  exampleInternalUpdateMutation: Scalars['String']['output'];
  examplePaginationQuery: Scalars['String']['output'];
  exampleSearchQuery: Scalars['String']['output'];
  exampleSimpleFindManyQuery: Scalars['String']['output'];
  exampleSimpleFindOneQuery: Scalars['String']['output'];
  fields: Array<GadgetModelField>;
  filterGraphQLTypeName?: Maybe<Scalars['String']['output']>;
  filterGraphQLTypeSDL?: Maybe<Scalars['String']['output']>;
  filterable: Scalars['Boolean']['output'];
  graphQLTypeName: Scalars['String']['output'];
  graphQLTypeSDL: Scalars['String']['output'];
  initialCreatedState?: Maybe<Scalars['String']['output']>;
  key: Scalars['String']['output'];
  name: Scalars['String']['output'];
  namespace?: Maybe<Array<Scalars['String']['output']>>;
  pluralApiIdentifier: Scalars['String']['output'];
  pluralName: Scalars['String']['output'];
  searchable: Scalars['Boolean']['output'];
  sortGraphQLTypeName?: Maybe<Scalars['String']['output']>;
  sortGraphQLTypeSDL?: Maybe<Scalars['String']['output']>;
  sortable: Scalars['Boolean']['output'];
  typescriptTypeInterface: Scalars['String']['output'];
  typescriptTypeInterfaceName: Scalars['String']['output'];
};


export type GadgetModelActionArgs = {
  apiIdentifier: Scalars['String']['input'];
};

/** One field of a Gadget model */
export type GadgetModelField = GadgetField & {
  __typename?: 'GadgetModelField';
  apiIdentifier: Scalars['String']['output'];
  configuration: GadgetFieldConfigInterface;
  examples: GadgetModelFieldExamples;
  fieldType: GadgetFieldType;
  filterable: Scalars['Boolean']['output'];
  hasDefault: Scalars['Boolean']['output'];
  isUniqueField: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  required: Scalars['Boolean']['output'];
  requiredArgumentForInput: Scalars['Boolean']['output'];
  sortable: Scalars['Boolean']['output'];
};

export type GadgetModelFieldExamples = {
  __typename?: 'GadgetModelFieldExamples';
  createNestedInParent?: Maybe<GadgetFieldUsageExample>;
  linkExistingChild?: Maybe<GadgetFieldUsageExample>;
  linkNewChild?: Maybe<GadgetFieldUsageExample>;
  linkToExistingParent?: Maybe<GadgetFieldUsageExample>;
};

/** One field of an action input or other transitory object in Gadget */
export type GadgetObjectField = GadgetField & {
  __typename?: 'GadgetObjectField';
  apiIdentifier: Scalars['String']['output'];
  configuration: GadgetFieldConfigInterface;
  fieldType: GadgetFieldType;
  hasDefault: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  required: Scalars['Boolean']['output'];
  requiredArgumentForInput: Scalars['Boolean']['output'];
};

export type GadgetObjectFieldConfig = GadgetFieldConfigInterface & {
  __typename?: 'GadgetObjectFieldConfig';
  fieldType: GadgetFieldType;
  fields: Array<GadgetModelField>;
  name?: Maybe<Scalars['String']['output']>;
};

/** Represents one of the roles an identity in the system can be entitled to */
export type GadgetRole = {
  __typename?: 'GadgetRole';
  key: Scalars['String']['output'];
  name: Scalars['String']['output'];
  order: Scalars['Int']['output'];
  selectable: Scalars['Boolean']['output'];
};

export type GadgetTrigger = {
  __typename?: 'GadgetTrigger';
  specID: Scalars['String']['output'];
};

export type GadgetV1MigrationEligibilityResult = {
  __typename?: 'GadgetV1MigrationEligibilityResult';
  eligible: Scalars['Boolean']['output'];
  reason?: Maybe<Scalars['String']['output']>;
};

export type GeneratePlatformAccessTokenResult = {
  __typename?: 'GeneratePlatformAccessTokenResult';
  createdAt: Scalars['DateTime']['output'];
  creator: PlatformAccessTokenUser;
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  token: Scalars['String']['output'];
};

export type IdentifySupportConversationResult = {
  __typename?: 'IdentifySupportConversationResult';
  identificationEmail: Scalars['String']['output'];
  identificationToken: Scalars['String']['output'];
};

export type InternalBulkCreateSessionsResult = {
  __typename?: 'InternalBulkCreateSessionsResult';
  errors?: Maybe<Array<ExecutionError>>;
  sessions?: Maybe<Array<Maybe<Scalars['InternalSessionRecord']['output']>>>;
  success: Scalars['Boolean']['output'];
};

export type InternalCreateSessionResult = {
  __typename?: 'InternalCreateSessionResult';
  errors?: Maybe<Array<ExecutionError>>;
  session?: Maybe<Scalars['InternalSessionRecord']['output']>;
  success: Scalars['Boolean']['output'];
};

export type InternalDeleteManySessionResult = {
  __typename?: 'InternalDeleteManySessionResult';
  errors?: Maybe<Array<ExecutionError>>;
  success: Scalars['Boolean']['output'];
};

export type InternalDeleteSessionResult = {
  __typename?: 'InternalDeleteSessionResult';
  errors?: Maybe<Array<ExecutionError>>;
  session?: Maybe<Scalars['InternalSessionRecord']['output']>;
  success: Scalars['Boolean']['output'];
};

export type InternalMutations = {
  __typename?: 'InternalMutations';
  /** Acquire a backend lock, returning only once the lock has been acquired */
  acquireLock: LockOperationResult;
  bulkCreateSessions?: Maybe<InternalBulkCreateSessionsResult>;
  commitTransaction: Scalars['String']['output'];
  createSession?: Maybe<InternalCreateSessionResult>;
  deleteManySession?: Maybe<InternalDeleteManySessionResult>;
  deleteSession?: Maybe<InternalDeleteSessionResult>;
  rollbackTransaction: Scalars['String']['output'];
  startTransaction: Scalars['String']['output'];
  updateSession?: Maybe<InternalUpdateSessionResult>;
};


export type InternalMutationsAcquireLockArgs = {
  lock: Scalars['String']['input'];
};


export type InternalMutationsBulkCreateSessionsArgs = {
  sessions: Array<InputMaybe<InternalSessionInput>>;
};


export type InternalMutationsCreateSessionArgs = {
  session?: InputMaybe<InternalSessionInput>;
};


export type InternalMutationsDeleteSessionArgs = {
  id: Scalars['GadgetID']['input'];
};


export type InternalMutationsUpdateSessionArgs = {
  id: Scalars['GadgetID']['input'];
  session?: InputMaybe<InternalSessionInput>;
};

export type InternalQueries = {
  __typename?: 'InternalQueries';
  /** Currently open platform transaction details, or null if no transaction is open */
  currentTransactionDetails?: Maybe<Scalars['JSONObject']['output']>;
  listSession: InternalSessionRecordConnection;
  session?: Maybe<Scalars['InternalSessionRecord']['output']>;
};


export type InternalQueriesListSessionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  select?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type InternalQueriesSessionArgs = {
  id: Scalars['GadgetID']['input'];
  select?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type InternalSessionInput = {
  createdAt?: InputMaybe<Scalars['DateTime']['input']>;
  id?: InputMaybe<Scalars['GadgetID']['input']>;
  /** A string list of Gadget platform Role keys to assign to this record */
  roles?: InputMaybe<Array<Scalars['String']['input']>>;
  state?: InputMaybe<Scalars['RecordState']['input']>;
  stateHistory?: InputMaybe<Scalars['RecordState']['input']>;
  updatedAt?: InputMaybe<Scalars['DateTime']['input']>;
};

/** A connection to a list of InternalSessionRecord items. */
export type InternalSessionRecordConnection = {
  __typename?: 'InternalSessionRecordConnection';
  /** A list of edges. */
  edges: Array<InternalSessionRecordEdge>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};

/** An edge in a InternalSessionRecord connection. */
export type InternalSessionRecordEdge = {
  __typename?: 'InternalSessionRecordEdge';
  /** A cursor for use in pagination */
  cursor: Scalars['String']['output'];
  /** The item at the end of the edge */
  node: Scalars['InternalSessionRecord']['output'];
};

export type InternalUpdateSessionResult = {
  __typename?: 'InternalUpdateSessionResult';
  errors?: Maybe<Array<ExecutionError>>;
  session?: Maybe<Scalars['InternalSessionRecord']['output']>;
  success: Scalars['Boolean']['output'];
};

/** This Error object represents one individual failed validation for a record field. It has a message which is appropriate for display to a user, and lists the apiIdentifier of the field in question. The `apiIdentifier` for the field is not guaranteed to exist on the model. */
export type InvalidFieldError = {
  __typename?: 'InvalidFieldError';
  /** The apiIdentifier of the field this error occurred on. */
  apiIdentifier: Scalars['String']['output'];
  /** The human facing error message for this error. */
  message: Scalars['String']['output'];
};

/** This object is returned as an error when a record doesn't pass the defined validations on the model. The validation messages for each of the invalid fields are available via the other fields on this error type. */
export type InvalidRecordError = ExecutionError & {
  __typename?: 'InvalidRecordError';
  /** The Gadget platform error code for this InvalidRecordError. */
  code: Scalars['String']['output'];
  /** The human facing error message for this error. */
  message: Scalars['String']['output'];
  /** The model of the record which failed validation */
  model?: Maybe<GadgetModel>;
  /** The record which failed validation, if available. Returns all the owned fields of the record -- no sub-selections are required or possible. Only available for super users. */
  record?: Maybe<Scalars['JSONObject']['output']>;
  /** The stack for any exception that caused the error */
  stack?: Maybe<Scalars['String']['output']>;
  /** A list of InvalidFieldError objects describing each of the errors encountered on the invalid record. */
  validationErrors?: Maybe<Array<InvalidFieldError>>;
  /** An object mapping field apiIdentifiers to arrays of validation error message strings for that field, as a JSON object. The object may have keys that don't correspond exactly to field apiIdentifiers if added by validations, and the object may have missing keys if no errors were encountered for that field. */
  validationErrorsByField?: Maybe<Scalars['JSONObject']['output']>;
};

export type LockOperationResult = {
  __typename?: 'LockOperationResult';
  /** Any errors encountered during the locking/unlocking operation */
  errors?: Maybe<Array<ExecutionError>>;
  /** Whether the lock operation succeeded */
  success: Scalars['Boolean']['output'];
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

export type MigrateGadgetV1Result = {
  __typename?: 'MigrateGadgetV1Result';
  installDependenciesOperationKey?: Maybe<Scalars['String']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type MigrateGadgetV1Status = {
  __typename?: 'MigrateGadgetV1Status';
  inProgress: Scalars['Boolean']['output'];
  progress?: Maybe<Scalars['String']['output']>;
  progressDetails?: Maybe<MigrateGadgetV1StatusProgressDetails>;
  success: Scalars['Boolean']['output'];
};

export type MigrateGadgetV1StatusProgressDetails = {
  __typename?: 'MigrateGadgetV1StatusProgressDetails';
  current: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export enum ModelExportFormat {
  Csv = 'CSV',
  Ndjson = 'NDJSON'
}

export type Mutation = {
  __typename?: 'Mutation';
  addApplicationTag?: Maybe<AddApplicationTagResult>;
  addUserTag?: Maybe<AddUserTagResult>;
  bulkCancelBackgroundActions: BackgroundActionBulkResult;
  bulkDeleteBackgroundActions: BackgroundActionBulkResult;
  bulkStartNextBackgroundActionAttemptsNow: BackgroundActionBulkResult;
  cancelBackgroundAction: BackgroundAction;
  changeAppDomain?: Maybe<ChangeAppDomainResult>;
  changeEnvironmentSlug?: Maybe<ChangeEnvironmentSlugResult>;
  convergePackages: Scalars['Boolean']['output'];
  createAction: RemoteFileSyncEvents;
  createEnvironment: Environment;
  createModel: RemoteFileSyncEvents;
  createModelFields: RemoteFileSyncEvents;
  createRoute: RemoteFileSyncEvents;
  deleteApp?: Maybe<DeleteAppStatusResult>;
  deleteBackgroundAction: Scalars['Boolean']['output'];
  deleteEnvironment: Scalars['Boolean']['output'];
  deletePlatformAccessTokens: Scalars['Boolean']['output'];
  /** @deprecated enabling frontends on legacy apps is no longer supported */
  enableFrontend?: Maybe<EnableFrontendResult>;
  exportModelData: Scalars['Boolean']['output'];
  /** Meta information about the application, like it's name, schema, and other internal details. */
  gadgetMeta: GadgetApplicationMeta;
  gadgetV1MigrationEligibility?: Maybe<GadgetV1MigrationEligibilityResult>;
  generatePlatformAccessToken: GeneratePlatformAccessTokenResult;
  internal?: Maybe<InternalMutations>;
  migrateAAC?: Maybe<MigrateAacResult>;
  /** @deprecated legacy environments are no longer supported */
  migrateEnvironments?: Maybe<MigrateEnvironmentsResult>;
  migrateGadgetV1?: Maybe<MigrateGadgetV1Result>;
  patchEnvironmentTree?: Maybe<EnvironmentPatchResult>;
  publish?: Maybe<EnvironmentPublishResult>;
  publishFileSyncEvents: PublishFileSyncEventsResult;
  refreshScopes?: Maybe<RefreshScopesResult>;
  registerWebhooks?: Maybe<RegisterWebhooksResult>;
  /** @deprecated use team */
  removeContributor?: Maybe<RemoveContributorResult>;
  /** @deprecated app invitations are no longer supported */
  sendAppInvitation?: Maybe<SendAppInvitationResult>;
  setFrameworkVersion: SetFrameworkVersionResult;
  startLogsExport: Scalars['Boolean']['output'];
  startNextBackgroundActionAttemptNow: BackgroundAction;
  syncToWebflow: Scalars['Boolean']['output'];
  triggerRunShopifySync?: Maybe<TriggerRunShopifySyncResult>;
  uninstallShop?: Maybe<UninstallShopResult>;
  unregisterWebhooks?: Maybe<UnregisterWebhooksResult>;
  updatePlatformAccessTokens: Array<AccessToken>;
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


export type MutationBulkCancelBackgroundActionsArgs = {
  filter: BackgroundActionFilter;
};


export type MutationBulkDeleteBackgroundActionsArgs = {
  filter: BackgroundActionFilter;
};


export type MutationBulkStartNextBackgroundActionAttemptsNowArgs = {
  filter: BackgroundActionFilter;
};


export type MutationCancelBackgroundActionArgs = {
  id: Scalars['String']['input'];
};


export type MutationChangeAppDomainArgs = {
  newSubdomain: Scalars['String']['input'];
  onlyValidate?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationChangeEnvironmentSlugArgs = {
  newSlug: Scalars['String']['input'];
  onlyValidate?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationCreateActionArgs = {
  path: Scalars['String']['input'];
};


export type MutationCreateEnvironmentArgs = {
  environment: EnvironmentInput;
};


export type MutationCreateModelArgs = {
  fields?: InputMaybe<Array<CreateModelFieldsInput>>;
  path: Scalars['String']['input'];
};


export type MutationCreateModelFieldsArgs = {
  fields: Array<CreateModelFieldsInput>;
  path: Scalars['String']['input'];
};


export type MutationCreateRouteArgs = {
  method: Scalars['String']['input'];
  path: Scalars['String']['input'];
};


export type MutationDeleteAppArgs = {
  onlyProduction?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationDeleteBackgroundActionArgs = {
  id: Scalars['String']['input'];
};


export type MutationDeleteEnvironmentArgs = {
  slug: Scalars['String']['input'];
};


export type MutationDeletePlatformAccessTokensArgs = {
  tokens: Array<Scalars['String']['input']>;
};


export type MutationEnableFrontendArgs = {
  hasShopifyConnection: Scalars['Boolean']['input'];
};


export type MutationExportModelDataArgs = {
  filterSort?: InputMaybe<Scalars['JSON']['input']>;
  format?: InputMaybe<ModelExportFormat>;
  modelApiIdentifier: Scalars['String']['input'];
  selection?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type MutationGeneratePlatformAccessTokenArgs = {
  name: Scalars['String']['input'];
};


export type MutationMigrateEnvironmentsArgs = {
  existingToProduction: Scalars['Boolean']['input'];
};


export type MutationPatchEnvironmentTreeArgs = {
  clientID: EnvironmentTreeClientId;
  patches: Array<Scalars['JSON']['input']>;
  txID?: InputMaybe<Scalars['String']['input']>;
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


export type MutationSetFrameworkVersionArgs = {
  constraint: Scalars['String']['input'];
};


export type MutationStartLogsExportArgs = {
  end?: InputMaybe<Scalars['DateTime']['input']>;
  query: Scalars['String']['input'];
  start: Scalars['DateTime']['input'];
};


export type MutationStartNextBackgroundActionAttemptNowArgs = {
  id: Scalars['String']['input'];
};


export type MutationTriggerRunShopifySyncArgs = {
  shopIds: Array<Scalars['String']['input']>;
};


export type MutationUninstallShopArgs = {
  shopId: Scalars['String']['input'];
};


export type MutationUnregisterWebhooksArgs = {
  apiKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  connectionKey: Scalars['String']['input'];
  modelKeys?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type MutationUpdatePlatformAccessTokensArgs = {
  tokens: Array<PlatformAccessTokenInput>;
};


export type MutationUploadFilesArgs = {
  files: Array<UploadFile>;
};


export type MutationUploadTemplateAssetArgs = {
  file: Scalars['Upload']['input'];
};

export type OffsetPageInfo = {
  __typename?: 'OffsetPageInfo';
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  page: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  /**
   * If the total is less than the real total, this will be true.
   *
   * Can be used, for example, to show a "100+" in the UI.
   */
  totalIncomplete: Scalars['Boolean']['output'];
};

/** Information about pagination in a connection. */
export type PageInfo = {
  __typename?: 'PageInfo';
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars['String']['output']>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars['Boolean']['output'];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type PlatformAccessTokenInput = {
  id: Scalars['String']['input'];
  name: Scalars['String']['input'];
};

export type PlatformAccessTokenUser = {
  __typename?: 'PlatformAccessTokenUser';
  email: Scalars['String']['output'];
  id: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
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
  deletedModelsAndFields?: Maybe<DeletedModelsAndFields>;
  issues: Array<PublishIssue>;
  progress: Scalars['String']['output'];
  publishStarted: Scalars['Boolean']['output'];
  remoteFilesVersion: Scalars['String']['output'];
  status?: Maybe<PublishStatus>;
};

export type Query = {
  __typename?: 'Query';
  apiUpgradeConvergePlan?: Maybe<ApiUpgradeConvergePlanResult>;
  appDomains: Array<AppDomain>;
  backgroundAction?: Maybe<BackgroundAction>;
  backgroundActions: BackgroundActionConnection;
  currentSession?: Maybe<Session>;
  currentUser: User;
  environmentTreeChildKeys: Array<Scalars['String']['output']>;
  environmentTreePath?: Maybe<Scalars['JSON']['output']>;
  environments: Array<Environment>;
  fileSyncComparisonHashes: FileSyncComparisonHashes;
  fileSyncFiles: FileSyncFiles;
  fileSyncHashes: FileSyncHashes;
  /** Meta information about the application, like it's name, schema, and other internal details. */
  gadgetMeta: GadgetApplicationMeta;
  identifySupportConversation?: Maybe<IdentifySupportConversationResult>;
  initialSnapshot: Scalars['JSON']['output'];
  internal?: Maybe<InternalQueries>;
  /** @deprecated use team */
  listContributors: Array<ContributorResult>;
  logsSearch: LogSearchResult;
  platformAccessTokens: Array<AccessToken>;
  publishIssues: Array<PublishIssue>;
  remoteFilesVersion: Scalars['String']['output'];
  roles: Array<GadgetRole>;
  runTestSupportFunction?: Maybe<Scalars['JSON']['output']>;
  session?: Maybe<Session>;
  sessions: SessionConnection;
  team: TeamResult;
  typesManifest: TypesManifest;
};


export type QueryApiUpgradeConvergePlanArgs = {
  currentVersion: Scalars['String']['input'];
  targetVersion: Scalars['String']['input'];
};


export type QueryBackgroundActionArgs = {
  id: Scalars['String']['input'];
};


export type QueryBackgroundActionsArgs = {
  filter?: InputMaybe<BackgroundActionFilter>;
  page?: InputMaybe<Scalars['Int']['input']>;
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


export type QuerySessionArgs = {
  id: Scalars['GadgetID']['input'];
};


export type QuerySessionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
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

/** A named group of permissions granted to a particular actor in the system. Managed in the Gadget editor. */
export type Role = {
  __typename?: 'Role';
  /** The stable identifier for this role. Null if the role has since been deleted. */
  key: Scalars['String']['output'];
  /** The human readable name for this role. Can be changed. */
  name: Scalars['String']['output'];
};

export type SendAppInvitationResult = {
  __typename?: 'SendAppInvitationResult';
  reason?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type Session = {
  __typename?: 'Session';
  /** Get all the fields for this record. Useful for not having to list out all the fields you want to retrieve, but slower. */
  _all: Scalars['JSONObject']['output'];
  /** The time at which this record was first created. Set once upon record creation and never changed. Managed by Gadget. */
  createdAt: Scalars['DateTime']['output'];
  /** The globally unique, unchanging identifier for this record. Assigned and managed by Gadget. */
  id?: Maybe<Scalars['GadgetID']['output']>;
  roles?: Maybe<Array<Role>>;
  /** The time at which this record was last changed. Set each time the record is successfully acted upon by an action. Managed by Gadget. */
  updatedAt: Scalars['DateTime']['output'];
};

/** A connection to a list of Session items. */
export type SessionConnection = {
  __typename?: 'SessionConnection';
  /** A list of edges. */
  edges: Array<SessionEdge>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};

/** An edge in a Session connection. */
export type SessionEdge = {
  __typename?: 'SessionEdge';
  /** A cursor for use in pagination */
  cursor: Scalars['String']['output'];
  /** The item at the end of the edge */
  node: Session;
};

export type SetFrameworkVersionResult = {
  __typename?: 'SetFrameworkVersionResult';
  installDependenciesOperationKey?: Maybe<Scalars['String']['output']>;
};

/** This Error object is returned for errors which don't have other specific handling. It has a message which is safe to display to users, but is often technical in nature. It also has a `code` field which is documented in the Gadget API Error Codes docs. */
export type SimpleError = ExecutionError & {
  __typename?: 'SimpleError';
  /** The Gadget platform error code for this error. */
  code: Scalars['String']['output'];
  /** The human facing error message for this error. */
  message: Scalars['String']['output'];
  /** The stack for any exception that caused the error */
  stack?: Maybe<Scalars['String']['output']>;
};

export type Subscription = {
  __typename?: 'Subscription';
  environmentTreePathPatches?: Maybe<EnvironmentSubscriptionResult>;
  logsSearch: LogSearchResult;
  migrateGadgetV1Status?: Maybe<MigrateGadgetV1Status>;
  openBackgroundActions: Scalars['Int']['output'];
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
  allowCharges?: InputMaybe<Scalars['Boolean']['input']>;
  allowDeletedData?: InputMaybe<Scalars['Boolean']['input']>;
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

export type TriggerRunShopifySyncResult = {
  __typename?: 'TriggerRunShopifySyncResult';
  failedShopIds: Array<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
  successfulShopIds: Array<Scalars['String']['output']>;
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

export type GadgetMetaModelsQueryVariables = Exact<{ [key: string]: never; }>;


export type GadgetMetaModelsQuery = { __typename?: 'Query', gadgetMeta: { __typename?: 'GadgetApplicationMeta', models: Array<{ __typename?: 'GadgetModel', apiIdentifier: string, namespace?: Array<string> | null }> } };

export type GadgetMetaGlobalActionsQueryVariables = Exact<{ [key: string]: never; }>;


export type GadgetMetaGlobalActionsQuery = { __typename?: 'Query', gadgetMeta: { __typename?: 'GadgetApplicationMeta', globalActions: Array<{ __typename?: 'GadgetGlobalAction', apiIdentifier: string, namespace?: Array<string> | null }> } };

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
  allowCharges?: InputMaybe<Scalars['Boolean']['input']>;
  allowDeletedData?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type PublishStatusSubscription = { __typename?: 'Subscription', publishStatus?: { __typename?: 'PublishStatusState', publishStarted: boolean, remoteFilesVersion: string, progress: string, issues: Array<{ __typename?: 'PublishIssue', severity: string, message: string, node?: { __typename?: 'PublishIssueNode', type: string, key: string, apiIdentifier?: string | null, name?: string | null, fieldType?: string | null, parentKey?: string | null, parentApiIdentifier?: string | null } | null, nodeLabels?: Array<{ __typename?: 'PublishIssueNodeLabel', type?: string | null, identifier?: string | null } | null> | null }>, deletedModelsAndFields?: { __typename?: 'DeletedModelsAndFields', deletedModels: Array<string>, deletedModelFields: Array<{ __typename?: 'DeletedModelField', modelIdentifier: string, fields: Array<string> }> } | null, status?: { __typename?: 'PublishStatus', code?: string | null, message?: string | null, output?: string | null } | null } | null };

export type CreateModelMutationVariables = Exact<{
  path: Scalars['String']['input'];
  fields?: InputMaybe<Array<CreateModelFieldsInput> | CreateModelFieldsInput>;
}>;


export type CreateModelMutation = { __typename?: 'Mutation', createModel: { __typename?: 'RemoteFileSyncEvents', remoteFilesVersion: string, changed: Array<{ __typename?: 'FileSyncChangedEvent', path: string, mode: number, content: string, encoding: FileSyncEncoding }> } };

export type CreateActionMutationVariables = Exact<{
  path: Scalars['String']['input'];
}>;


export type CreateActionMutation = { __typename?: 'Mutation', createAction: { __typename?: 'RemoteFileSyncEvents', remoteFilesVersion: string, changed: Array<{ __typename?: 'FileSyncChangedEvent', path: string, mode: number, content: string, encoding: FileSyncEncoding }> } };

export type CreateRouteMutationVariables = Exact<{
  method: Scalars['String']['input'];
  path: Scalars['String']['input'];
}>;


export type CreateRouteMutation = { __typename?: 'Mutation', createRoute: { __typename?: 'RemoteFileSyncEvents', remoteFilesVersion: string, changed: Array<{ __typename?: 'FileSyncChangedEvent', path: string, mode: number, content: string, encoding: FileSyncEncoding }> } };

export type CreateModelFieldsMutationVariables = Exact<{
  path: Scalars['String']['input'];
  fields: Array<CreateModelFieldsInput> | CreateModelFieldsInput;
}>;


export type CreateModelFieldsMutation = { __typename?: 'Mutation', createModelFields: { __typename?: 'RemoteFileSyncEvents', remoteFilesVersion: string, changed: Array<{ __typename?: 'FileSyncChangedEvent', path: string, mode: number, content: string, encoding: FileSyncEncoding }> } };
