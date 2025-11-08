import { FieldSelection, FilterNever } from "@gadgetinc/api-client-core";

type JSONValue =
    | string
    | number
    | boolean
    | JSONObject
    | JSONArray;

interface JSONObject {
    [x: string]: JSONValue;
}

interface JSONArray extends Array<JSONValue> { }


export enum GadgetFieldType {
  ID,
  Number,
  String,
  Enum,
  RichText,
  DateTime,
  Email,
  URL,
  Money,
  File,
  Color,
  Password,
  Computed,
  HasManyThrough,
  BelongsTo,
  HasMany,
  HasOne,
  Boolean,
  Object,
  Array,
  JSON,
  Code,
  EncryptedString,
  Vector,
  Any,
  Null,
  RecordState,
  RoleAssignments,
}


/** A sort order for a field. Can be Ascending or Descending. */
export type SortOrder = "Ascending"|"Descending";

/** Represents one user result record in internal api calls. Returns a JSON blob of all the record's fields. */
export type InternalUserRecord = Scalars["JSONObject"];

/** Represents one session result record in internal api calls. Returns a JSON blob of all the record's fields. */
export type InternalSessionRecord = Scalars["JSONObject"];



export type UserSort = {

  /** Sort the results by the id field. Defaults to ascending (smallest value first). */
  id?: SortOrder | null;

  /** Sort the results by the createdAt field. Defaults to ascending (smallest value first). */
  createdAt?: SortOrder | null;

  /** Sort the results by the updatedAt field. Defaults to ascending (smallest value first). */
  updatedAt?: SortOrder | null;

  /** Sort the results by the resetPasswordToken field. Defaults to ascending (smallest value first). */
  resetPasswordToken?: SortOrder | null;

  /** Sort the results by the emailVerificationToken field. Defaults to ascending (smallest value first). */
  emailVerificationToken?: SortOrder | null;

  /** Sort the results by the email field. Defaults to ascending (smallest value first). */
  email?: SortOrder | null;

  /** Sort the results by the googleProfileId field. Defaults to ascending (smallest value first). */
  googleProfileId?: SortOrder | null;

  /** Sort the results by the emailVerificationTokenExpiration field. Defaults to ascending (smallest value first). */
  emailVerificationTokenExpiration?: SortOrder | null;

  /** Sort the results by the lastSignedIn field. Defaults to ascending (smallest value first). */
  lastSignedIn?: SortOrder | null;

  /** Sort the results by the firstName field. Defaults to ascending (smallest value first). */
  firstName?: SortOrder | null;

  /** Sort the results by the emailVerified field. Defaults to ascending (smallest value first). */
  emailVerified?: SortOrder | null;

  /** Sort the results by the resetPasswordTokenExpiration field. Defaults to ascending (smallest value first). */
  resetPasswordTokenExpiration?: SortOrder | null;

  /** Sort the results by the lastName field. Defaults to ascending (smallest value first). */
  lastName?: SortOrder | null;

  /** Sort the results by the googleImageUrl field. Defaults to ascending (smallest value first). */
  googleImageUrl?: SortOrder | null;
};



export type UserFilter = {

  AND?: (UserFilter | null)[];

  OR?: (UserFilter | null)[];

  NOT?: (UserFilter | null)[];

  id?: IDFilter | null;

  createdAt?: DateTimeFilter | null;

  updatedAt?: DateTimeFilter | null;

  resetPasswordToken?: StringFilter | null;

  emailVerificationToken?: StringFilter | null;

  email?: StringFilter | null;

  googleProfileId?: StringFilter | null;

  emailVerificationTokenExpiration?: DateTimeFilter | null;

  lastSignedIn?: DateTimeFilter | null;

  firstName?: StringFilter | null;

  emailVerified?: BooleanFilter | null;

  resetPasswordTokenExpiration?: DateTimeFilter | null;

  lastName?: StringFilter | null;

  googleImageUrl?: StringFilter | null;
};



export type IDFilter = {

  equals?: (Scalars['GadgetID'] | null) | null;

  notEquals?: (Scalars['GadgetID'] | null) | null;

  isSet?: (Scalars['Boolean'] | null) | null;

  in?: ((Scalars['GadgetID'] | null) | null)[];

  notIn?: ((Scalars['GadgetID'] | null) | null)[];

  lessThan?: (Scalars['GadgetID'] | null) | null;

  lessThanOrEqual?: (Scalars['GadgetID'] | null) | null;

  greaterThan?: (Scalars['GadgetID'] | null) | null;

  greaterThanOrEqual?: (Scalars['GadgetID'] | null) | null;
};



export type DateTimeFilter = {

  equals?: Date | Scalars['ISO8601DateString'] | null;

  notEquals?: Date | Scalars['ISO8601DateString'] | null;

  isSet?: (Scalars['Boolean'] | null) | null;

  in?: (Date | Scalars['ISO8601DateString'] | null)[];

  notIn?: (Date | Scalars['ISO8601DateString'] | null)[];

  lessThan?: Date | Scalars['ISO8601DateString'] | null;

  lessThanOrEqual?: Date | Scalars['ISO8601DateString'] | null;

  greaterThan?: Date | Scalars['ISO8601DateString'] | null;

  greaterThanOrEqual?: Date | Scalars['ISO8601DateString'] | null;

  before?: Date | Scalars['ISO8601DateString'] | null;

  after?: Date | Scalars['ISO8601DateString'] | null;
};



export type StringFilter = {

  equals?: (Scalars['String'] | null) | null;

  notEquals?: (Scalars['String'] | null) | null;

  isSet?: (Scalars['Boolean'] | null) | null;

  in?: ((Scalars['String'] | null) | null)[];

  notIn?: ((Scalars['String'] | null) | null)[];

  lessThan?: (Scalars['String'] | null) | null;

  lessThanOrEqual?: (Scalars['String'] | null) | null;

  greaterThan?: (Scalars['String'] | null) | null;

  greaterThanOrEqual?: (Scalars['String'] | null) | null;

  startsWith?: (Scalars['String'] | null) | null;
};



export type BooleanFilter = {

  isSet?: (Scalars['Boolean'] | null) | null;

  equals?: (Scalars['Boolean'] | null) | null;

  notEquals?: (Scalars['Boolean'] | null) | null;
};



export type BulkSignUpUsersInput = {

  email?: (Scalars['String'] | null) | null;

  password?: (Scalars['String'] | null) | null;
};



export type BulkSignInUsersInput = {

  email?: (Scalars['String'] | null) | null;

  password?: (Scalars['String'] | null) | null;
};



export type SignOutUserInput = {

  resetPasswordToken?: (Scalars['String'] | null) | null;

  emailVerificationToken?: (Scalars['String'] | null) | null;

  password?: (Scalars['String'] | null) | null;

  email?: (Scalars['String'] | null) | null;

  googleProfileId?: (Scalars['String'] | null) | null;

  emailVerificationTokenExpiration?: Date | Scalars['ISO8601DateString'] | null;

  lastSignedIn?: Date | Scalars['ISO8601DateString'] | null;

  firstName?: (Scalars['String'] | null) | null;

  emailVerified?: (Scalars['Boolean'] | null) | null;

  resetPasswordTokenExpiration?: Date | Scalars['ISO8601DateString'] | null;

  lastName?: (Scalars['String'] | null) | null;

  googleImageUrl?: (Scalars['String'] | null) | null;
};



export type BulkSignOutUsersInput = {

  user?: SignOutUserInput | null;

  id: (Scalars['GadgetID'] | null);
};



export type UpdateUserInput = {

  resetPasswordToken?: (Scalars['String'] | null) | null;

  emailVerificationToken?: (Scalars['String'] | null) | null;

  password?: (Scalars['String'] | null) | null;

  email?: (Scalars['String'] | null) | null;

  googleProfileId?: (Scalars['String'] | null) | null;

  emailVerificationTokenExpiration?: Date | Scalars['ISO8601DateString'] | null;

  lastSignedIn?: Date | Scalars['ISO8601DateString'] | null;

  firstName?: (Scalars['String'] | null) | null;

  emailVerified?: (Scalars['Boolean'] | null) | null;

  resetPasswordTokenExpiration?: Date | Scalars['ISO8601DateString'] | null;

  lastName?: (Scalars['String'] | null) | null;

  googleImageUrl?: (Scalars['String'] | null) | null;
};



export type BulkUpdateUsersInput = {

  user?: UpdateUserInput | null;

  id: (Scalars['GadgetID'] | null);
};



export type BulkSendVerifyEmailUsersInput = {

  email?: (Scalars['String'] | null) | null;
};



export type BulkVerifyEmailUsersInput = {

  code?: (Scalars['String'] | null) | null;
};



export type BulkSendResetPasswordUsersInput = {

  email?: (Scalars['String'] | null) | null;
};



export type BulkResetPasswordUsersInput = {

  password?: (Scalars['String'] | null) | null;

  code?: (Scalars['String'] | null) | null;
};



export type BulkChangePasswordUsersInput = {

  id: (Scalars['GadgetID'] | null);

  currentPassword?: (Scalars['String'] | null) | null;

  newPassword?: (Scalars['String'] | null) | null;
};



export type InternalUserInput = {

  state?: (Scalars['RecordState'] | null) | null;

  stateHistory?: (Scalars['RecordState'] | null) | null;

  id?: (Scalars['GadgetID'] | null) | null;

  createdAt?: Date | Scalars['ISO8601DateString'] | null;

  updatedAt?: Date | Scalars['ISO8601DateString'] | null;

  resetPasswordToken?: (Scalars['String'] | null) | null;

  emailVerificationToken?: (Scalars['String'] | null) | null;

  password?: (Scalars['String'] | null) | null;

  /** A string list of Gadget platform Role keys to assign to this record */
  roles?: ((Scalars['String'] | null))[];

  email?: (Scalars['String'] | null) | null;

  googleProfileId?: (Scalars['String'] | null) | null;

  emailVerificationTokenExpiration?: Date | Scalars['ISO8601DateString'] | null;

  lastSignedIn?: Date | Scalars['ISO8601DateString'] | null;

  firstName?: (Scalars['String'] | null) | null;

  emailVerified?: (Scalars['Boolean'] | null) | null;

  resetPasswordTokenExpiration?: Date | Scalars['ISO8601DateString'] | null;

  lastName?: (Scalars['String'] | null) | null;

  googleImageUrl?: (Scalars['String'] | null) | null;
};



export type AppGraphQLTriggerMutationContext = {

  /** The ID of the session that triggered this mutation. Will be the session that's loaded in the mutation context. */
  sessionID?: (Scalars['GadgetID'] | null) | null;
};



export type InternalSessionInput = {

  state?: (Scalars['RecordState'] | null) | null;

  stateHistory?: (Scalars['RecordState'] | null) | null;

  id?: (Scalars['GadgetID'] | null) | null;

  createdAt?: Date | Scalars['ISO8601DateString'] | null;

  updatedAt?: Date | Scalars['ISO8601DateString'] | null;

  user?: InternalBelongsToInput | null;
};



export type InternalBelongsToInput = {

  /** Existing ID of another record, which you would like to associate this record with */
  _link?: (Scalars['GadgetID'] | null) | null;
};


/** All built-in and custom scalars, mapped to their actual values */
export interface Scalars {
  /** Represents an amount of some currency. Specified as a string so user's aren't tempted to do math on the value. */
  CurrencyAmount: string;
  /** Represents a UTC date formatted an ISO-8601 formatted 'full-date' string. */
  ISO8601DateString: string;
  /** A file object produced by a browser for uploading to cloud storage */
  Upload: File;
  /** The `String` scalar type represents textual data, represented as UTF-8 character sequences. The String type is most often used by GraphQL to represent free-form human-readable text. */
  String: string;
  /** The `JSONObject` scalar type represents JSON objects as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSONObject: JSONObject;
  /** The `Boolean` scalar type represents `true` or `false`. */
  Boolean: boolean;
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: JSONValue;
  /** The ID of a record in Gadget */
  GadgetID: string;
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  DateTime: Date;
  /** A field whose value conforms to the standard internet email address format as specified in RFC822: https://www.w3.org/Protocols/rfc822/. */
  EmailAddress: string;
  /** A field whose value conforms to the standard URL format as specified in RFC3986: https://www.ietf.org/rfc/rfc3986.txt. */
  URL: string;
  /** The `Int` scalar type represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1. */
  Int: number;
  /** A time duration expressed in ISO format, e.g. P20Y3M15DT0H0M0S */
  Duration: string;
  /** Represents the state of one record in a Gadget database. Represented as either a string or set of strings nested in objects. */
  RecordState: (string | { [key: string]: Scalars['RecordState'] });
  /** Instructions for a client to turn raw transport types (like strings) into useful client side types (like Dates). Unstable and not intended for developer use. */
  HydrationPlan: unknown;
};


/** This Error object is returned for errors which don't have other specific handling. It has a message which is safe to display to users, but is often technical in nature. It also has a `code` field which is documented in the Gadget API Error Codes docs. */
export interface SimpleError extends ExecutionError {
  __typename: 'SimpleError';
  /** The human facing error message for this error. */
  message: Scalars['String'];
  /** The Gadget platform error code for this error. */
  code: Scalars['String'];
  /** The stack for any exception that caused the error */
  stack: (Scalars['String'] | null);
};



export type AvailableSimpleErrorSelection = {

  __typename?: boolean | null | undefined;

  /** The human facing error message for this error. */
  message?: boolean | null | undefined;

  /** The Gadget platform error code for this error. */
  code?: boolean | null | undefined;

  /** The stack for any exception that caused the error */
  stack?: boolean | null | undefined;
};



export type ExecutionError = {

  __typename: 'SimpleError'|'InvalidRecordError';

  /** The human facing error message for this error. */
  message: Scalars['String'];

  /** The Gadget platform error code for this error. */
  code: Scalars['String'];

  /** The stack for any exception that caused the error. Only available for super users. */
  stack: (Scalars['String'] | null);
};



export type AvailableExecutionErrorSelection = {

  __typename?: boolean | null | undefined;

  /** The human facing error message for this error. */
  message?: boolean | null | undefined;

  /** The Gadget platform error code for this error. */
  code?: boolean | null | undefined;

  /** The stack for any exception that caused the error. Only available for super users. */
  stack?: boolean | null | undefined;
};


/** This object is returned as an error when a record doesn't pass the defined validations on the model. The validation messages for each of the invalid fields are available via the other fields on this error type. */
export interface InvalidRecordError extends ExecutionError {
  __typename: 'InvalidRecordError';
  /** The human facing error message for this error. */
  message: Scalars['String'];
  /** The Gadget platform error code for this InvalidRecordError. */
  code: Scalars['String'];
  /** The stack for any exception that caused the error */
  stack: (Scalars['String'] | null);
  /** An object mapping field apiIdentifiers to arrays of validation error message strings for that field, as a JSON object. The object may have keys that don't correspond exactly to field apiIdentifiers if added by validations, and the object may have missing keys if no errors were encountered for that field. */
  validationErrorsByField: (Scalars['JSONObject'] | null);
  /** A list of InvalidFieldError objects describing each of the errors encountered on the invalid record. */
  validationErrors: InvalidFieldError[];
  /** The record which failed validation, if available. Returns all the owned fields of the record -- no sub-selections are required or possible. Only available for super users. */
  record: (Scalars['JSONObject'] | null);
  /** The model of the record which failed validation */
  model: (GadgetModel | null);
};



export type AvailableInvalidRecordErrorSelection = {

  __typename?: boolean | null | undefined;

  /** The human facing error message for this error. */
  message?: boolean | null | undefined;

  /** The Gadget platform error code for this InvalidRecordError. */
  code?: boolean | null | undefined;

  /** The stack for any exception that caused the error */
  stack?: boolean | null | undefined;

  /** An object mapping field apiIdentifiers to arrays of validation error message strings for that field, as a JSON object. The object may have keys that don't correspond exactly to field apiIdentifiers if added by validations, and the object may have missing keys if no errors were encountered for that field. */
  validationErrorsByField?: boolean | null | undefined;

  /** A list of InvalidFieldError objects describing each of the errors encountered on the invalid record. */
  validationErrors?: AvailableInvalidFieldErrorSelection;

  /** The record which failed validation, if available. Returns all the owned fields of the record -- no sub-selections are required or possible. Only available for super users. */
  record?: boolean | null | undefined;

  /** The model of the record which failed validation */
  model?: AvailableGadgetModelSelection;
};


/** This Error object represents one individual failed validation for a record field. It has a message which is appropriate for display to a user, and lists the apiIdentifier of the field in question. The `apiIdentifier` for the field is not guaranteed to exist on the model. */
export type InvalidFieldError = {

  __typename: 'InvalidFieldError';

  /** The human facing error message for this error. */
  message: Scalars['String'];

  /** The apiIdentifier of the field this error occurred on. */
  apiIdentifier: Scalars['String'];
};



export type AvailableInvalidFieldErrorSelection = {

  __typename?: boolean | null | undefined;

  /** The human facing error message for this error. */
  message?: boolean | null | undefined;

  /** The apiIdentifier of the field this error occurred on. */
  apiIdentifier?: boolean | null | undefined;
};



export type GadgetModel = {

  __typename: 'GadgetModel';

  key: Scalars['String'];

  name: Scalars['String'];

  apiIdentifier: Scalars['String'];

  filterable: Scalars['Boolean'];

  sortable: Scalars['Boolean'];

  searchable: Scalars['Boolean'];

  fields: GadgetModelField[];

  actions: GadgetAction[];

  action: (GadgetAction | null);

  pluralName: Scalars['String'];

  pluralApiIdentifier: Scalars['String'];

  currentSingletonApiIdentifier: (Scalars['String'] | null);

  initialCreatedState: (Scalars['String'] | null);
};



export type AvailableGadgetModelSelection = {

  __typename?: boolean | null | undefined;

  key?: boolean | null | undefined;

  name?: boolean | null | undefined;

  apiIdentifier?: boolean | null | undefined;

  filterable?: boolean | null | undefined;

  sortable?: boolean | null | undefined;

  searchable?: boolean | null | undefined;

  fields?: AvailableGadgetModelFieldSelection;

  actions?: AvailableGadgetActionSelection;

  action?: AvailableGadgetActionSelection;

  pluralName?: boolean | null | undefined;

  pluralApiIdentifier?: boolean | null | undefined;

  currentSingletonApiIdentifier?: boolean | null | undefined;

  initialCreatedState?: boolean | null | undefined;
};


/** One field of a Gadget model */
export interface GadgetModelField extends GadgetField {
  __typename: 'GadgetModelField';
  name: Scalars['String'];
  apiIdentifier: Scalars['String'];
  fieldType: GadgetFieldType;
  hasDefault: Scalars['Boolean'];
  required: Scalars['Boolean'];
  requiredArgumentForInput: Scalars['Boolean'];
  configuration: GadgetFieldConfigInterface;
  isUniqueField: Scalars['Boolean'];
  sortable: Scalars['Boolean'];
  filterable: Scalars['Boolean'];
  examples: GadgetModelFieldExamples;
};



export type AvailableGadgetModelFieldSelection = {

  __typename?: boolean | null | undefined;

  name?: boolean | null | undefined;

  apiIdentifier?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;

  hasDefault?: boolean | null | undefined;

  required?: boolean | null | undefined;

  requiredArgumentForInput?: boolean | null | undefined;

  configuration?: AvailableGadgetFieldConfigInterfaceSelection;

  isUniqueField?: boolean | null | undefined;

  sortable?: boolean | null | undefined;

  filterable?: boolean | null | undefined;

  examples?: AvailableGadgetModelFieldExamplesSelection;
};



export type GadgetField = {

  __typename: 'GadgetModelField'|'GadgetObjectField';

  name: Scalars['String'];

  apiIdentifier: Scalars['String'];

  fieldType: GadgetFieldType;

  hasDefault: Scalars['Boolean'];

  required: Scalars['Boolean'];

  requiredArgumentForInput: Scalars['Boolean'];

  configuration: GadgetFieldConfigInterface;
};



export type AvailableGadgetFieldSelection = {

  __typename?: boolean | null | undefined;

  name?: boolean | null | undefined;

  apiIdentifier?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;

  hasDefault?: boolean | null | undefined;

  required?: boolean | null | undefined;

  requiredArgumentForInput?: boolean | null | undefined;

  configuration?: AvailableGadgetFieldConfigInterfaceSelection;
};


/** The common bits that all field configuration types share */
export type GadgetFieldConfigInterface = {

  __typename: 'GadgetGenericFieldConfig'|'GadgetObjectFieldConfig'|'GadgetBelongsToConfig'|'GadgetHasManyConfig'|'GadgetEnumConfig'|'GadgetDateTimeConfig';

  fieldType: GadgetFieldType;
};



export type AvailableGadgetFieldConfigInterfaceSelection = {

  __typename?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;
};



export type GadgetModelFieldExamples = {

  __typename: 'GadgetModelFieldExamples';

  linkExistingChild: (GadgetFieldUsageExample | null);

  linkNewChild: (GadgetFieldUsageExample | null);

  linkToExistingParent: (GadgetFieldUsageExample | null);

  createNestedInParent: (GadgetFieldUsageExample | null);
};



export type AvailableGadgetModelFieldExamplesSelection = {

  __typename?: boolean | null | undefined;

  linkExistingChild?: AvailableGadgetFieldUsageExampleSelection;

  linkNewChild?: AvailableGadgetFieldUsageExampleSelection;

  linkToExistingParent?: AvailableGadgetFieldUsageExampleSelection;

  createNestedInParent?: AvailableGadgetFieldUsageExampleSelection;
};



export type GadgetFieldUsageExample = {

  __typename: 'GadgetFieldUsageExample';

  exampleGraphQLMutation: Scalars['String'];

  exampleGraphQLVariables: Scalars['JSON'];

  exampleImperativeInvocation: Scalars['String'];

  exampleReactHook: Scalars['String'];
};



export type AvailableGadgetFieldUsageExampleSelection = {

  __typename?: boolean | null | undefined;

  exampleGraphQLMutation?: boolean | null | undefined;

  exampleGraphQLVariables?: boolean | null | undefined;

  exampleImperativeInvocation?: boolean | null | undefined;

  exampleReactHook?: boolean | null | undefined;
};



export type GadgetAction = {

  __typename: 'GadgetAction';

  name: Scalars['String'];

  apiIdentifier: Scalars['String'];

  requiresInput: Scalars['Boolean'];

  acceptsInput: Scalars['Boolean'];

  /** @deprecated This field will be removed. Use `isDeleteAction` instead. */
  hasDeleteRecordEffect: Scalars['Boolean'];

  /** @deprecated This field will be removed. Use `isCreateOrUpdateAction` instead. */
  hasCreateOrUpdateEffect: Scalars['Boolean'];

  isDeleteAction: Scalars['Boolean'];

  isCreateOrUpdateAction: Scalars['Boolean'];

  operatesWithRecordIdentity: Scalars['Boolean'];

  possibleTransitions: Scalars['JSONObject'];

  availableInBulk: Scalars['Boolean'];

  bulkApiIdentifier: (Scalars['String'] | null);

  hasAmbiguousIdentifier: Scalars['Boolean'];

  inputFields: GadgetObjectField[];

  bulkInvokedByIDOnly: Scalars['Boolean'];

  triggers: GadgetTrigger[];

  examples: (GadgetActionGraphQLType | null);
};



export type AvailableGadgetActionSelection = {

  __typename?: boolean | null | undefined;

  name?: boolean | null | undefined;

  apiIdentifier?: boolean | null | undefined;

  requiresInput?: boolean | null | undefined;

  acceptsInput?: boolean | null | undefined;

  /** @deprecated This field will be removed. Use `isDeleteAction` instead. */
  hasDeleteRecordEffect?: boolean | null | undefined;

  /** @deprecated This field will be removed. Use `isCreateOrUpdateAction` instead. */
  hasCreateOrUpdateEffect?: boolean | null | undefined;

  isDeleteAction?: boolean | null | undefined;

  isCreateOrUpdateAction?: boolean | null | undefined;

  operatesWithRecordIdentity?: boolean | null | undefined;

  possibleTransitions?: boolean | null | undefined;

  availableInBulk?: boolean | null | undefined;

  bulkApiIdentifier?: boolean | null | undefined;

  hasAmbiguousIdentifier?: boolean | null | undefined;

  inputFields?: AvailableGadgetObjectFieldSelection;

  bulkInvokedByIDOnly?: boolean | null | undefined;

  triggers?: AvailableGadgetTriggerSelection;

  examples?: AvailableGadgetActionGraphQLTypeSelection;
};


/** One field of an action input or other transitory object in Gadget */
export interface GadgetObjectField extends GadgetField {
  __typename: 'GadgetObjectField';
  name: Scalars['String'];
  apiIdentifier: Scalars['String'];
  fieldType: GadgetFieldType;
  hasDefault: Scalars['Boolean'];
  required: Scalars['Boolean'];
  requiredArgumentForInput: Scalars['Boolean'];
  configuration: GadgetFieldConfigInterface;
};



export type AvailableGadgetObjectFieldSelection = {

  __typename?: boolean | null | undefined;

  name?: boolean | null | undefined;

  apiIdentifier?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;

  hasDefault?: boolean | null | undefined;

  required?: boolean | null | undefined;

  requiredArgumentForInput?: boolean | null | undefined;

  configuration?: AvailableGadgetFieldConfigInterfaceSelection;
};



export type GadgetTrigger = {

  __typename: 'GadgetTrigger';

  specID: Scalars['String'];
};



export type AvailableGadgetTriggerSelection = {

  __typename?: boolean | null | undefined;

  specID?: boolean | null | undefined;
};



export type GadgetActionGraphQLType = {

  __typename: 'GadgetActionGraphQLType';

  /** @deprecated moved to exampleGraphQLMutation */
  exampleMutation: Scalars['String'];

  exampleGraphQLMutation: Scalars['String'];

  inputGraphQLTypeSDL: (Scalars['String'] | null);

  outputGraphQLTypeSDL: Scalars['String'];

  inputTypeScriptInterface: (Scalars['String'] | null);

  outputTypeScriptInterface: Scalars['String'];

  exampleGraphQLVariables: Scalars['JSON'];

  exampleJSInputs: Scalars['JSON'];

  exampleImperativeInvocation: Scalars['String'];

  exampleReactHook: Scalars['String'];

  /** @deprecated moved to exampleBulkGraphQLMutation */
  exampleBulkMutation: (Scalars['String'] | null);

  exampleBulkGraphQLMutation: (Scalars['String'] | null);

  exampleBulkGraphQLVariables: (Scalars['JSON'] | null);

  exampleBulkImperativeInvocation: (Scalars['String'] | null);

  exampleBulkReactHook: (Scalars['String'] | null);

  bulkOutputGraphQLTypeSDL: (Scalars['String'] | null);
};



export type AvailableGadgetActionGraphQLTypeSelection = {

  __typename?: boolean | null | undefined;

  /** @deprecated moved to exampleGraphQLMutation */
  exampleMutation?: boolean | null | undefined;

  exampleGraphQLMutation?: boolean | null | undefined;

  inputGraphQLTypeSDL?: boolean | null | undefined;

  outputGraphQLTypeSDL?: boolean | null | undefined;

  inputTypeScriptInterface?: boolean | null | undefined;

  outputTypeScriptInterface?: boolean | null | undefined;

  exampleGraphQLVariables?: boolean | null | undefined;

  exampleJSInputs?: boolean | null | undefined;

  exampleImperativeInvocation?: boolean | null | undefined;

  exampleReactHook?: boolean | null | undefined;

  /** @deprecated moved to exampleBulkGraphQLMutation */
  exampleBulkMutation?: boolean | null | undefined;

  exampleBulkGraphQLMutation?: boolean | null | undefined;

  exampleBulkGraphQLVariables?: boolean | null | undefined;

  exampleBulkImperativeInvocation?: boolean | null | undefined;

  exampleBulkReactHook?: boolean | null | undefined;

  bulkOutputGraphQLTypeSDL?: boolean | null | undefined;
};



export interface GadgetGenericFieldConfig extends GadgetFieldConfigInterface {
  __typename: 'GadgetGenericFieldConfig';
  fieldType: GadgetFieldType;
};



export type AvailableGadgetGenericFieldConfigSelection = {

  __typename?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;
};



export interface GadgetObjectFieldConfig extends GadgetFieldConfigInterface {
  __typename: 'GadgetObjectFieldConfig';
  fieldType: GadgetFieldType;
  name: (Scalars['String'] | null);
  fields: GadgetModelField[];
};



export type AvailableGadgetObjectFieldConfigSelection = {

  __typename?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;

  name?: boolean | null | undefined;

  fields?: AvailableGadgetModelFieldSelection;
};



export interface GadgetBelongsToConfig extends GadgetFieldConfigInterface {
  __typename: 'GadgetBelongsToConfig';
  fieldType: GadgetFieldType;
  relatedModelKey: (Scalars['String'] | null);
  relatedModel: (GadgetModel | null);
  isConfigured: Scalars['Boolean'];
  isInverseConfigured: Scalars['Boolean'];
};



export type AvailableGadgetBelongsToConfigSelection = {

  __typename?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;

  relatedModelKey?: boolean | null | undefined;

  relatedModel?: AvailableGadgetModelSelection;

  isConfigured?: boolean | null | undefined;

  isInverseConfigured?: boolean | null | undefined;
};



export interface GadgetHasManyConfig extends GadgetFieldConfigInterface {
  __typename: 'GadgetHasManyConfig';
  fieldType: GadgetFieldType;
  relatedModelKey: (Scalars['String'] | null);
  relatedModel: (GadgetModel | null);
  isConfigured: Scalars['Boolean'];
  isInverseConfigured: Scalars['Boolean'];
};



export type AvailableGadgetHasManyConfigSelection = {

  __typename?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;

  relatedModelKey?: boolean | null | undefined;

  relatedModel?: AvailableGadgetModelSelection;

  isConfigured?: boolean | null | undefined;

  isInverseConfigured?: boolean | null | undefined;
};



export interface GadgetEnumConfig extends GadgetFieldConfigInterface {
  __typename: 'GadgetEnumConfig';
  fieldType: GadgetFieldType;
  allowMultiple: Scalars['Boolean'];
  allowOther: Scalars['Boolean'];
  options: GadgetEnumOption[];
};



export type AvailableGadgetEnumConfigSelection = {

  __typename?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;

  allowMultiple?: boolean | null | undefined;

  allowOther?: boolean | null | undefined;

  options?: AvailableGadgetEnumOptionSelection;
};



export type GadgetEnumOption = {

  __typename: 'GadgetEnumOption';

  name: Scalars['String'];

  color: Scalars['String'];
};



export type AvailableGadgetEnumOptionSelection = {

  __typename?: boolean | null | undefined;

  name?: boolean | null | undefined;

  color?: boolean | null | undefined;
};



export interface GadgetDateTimeConfig extends GadgetFieldConfigInterface {
  __typename: 'GadgetDateTimeConfig';
  fieldType: GadgetFieldType;
  includeTime: Scalars['Boolean'];
};



export type AvailableGadgetDateTimeConfigSelection = {

  __typename?: boolean | null | undefined;

  fieldType?: boolean | null | undefined;

  includeTime?: boolean | null | undefined;
};



export type Query = {

  __typename: 'Query';

  user: (User | null);

  users: UserConnection;

  session: (Session | null);

  sessions: SessionConnection;

  internal: (InternalQueries | null);

  currentSession: (Session | null);
};



export type AvailableQuerySelection = {

  __typename?: boolean | null | undefined;

  user?: AvailableUserSelection;

  users?: AvailableUserConnectionSelection;

  session?: AvailableSessionSelection;

  sessions?: AvailableSessionConnectionSelection;

  internal?: AvailableInternalQueriesSelection;

  currentSession?: AvailableSessionSelection;
};



export type User = {

  __typename: 'User';

  /** The globally unique, unchanging identifier for this record. Assigned and managed by Gadget. */
  id: Scalars['GadgetID'];

  /** The time at which this record was first created. Set once upon record creation and never changed. Managed by Gadget. */
  createdAt: Scalars['DateTime'];

  /** The time at which this record was last changed. Set each time the record is successfully acted upon by an action. Managed by Gadget. */
  updatedAt: Scalars['DateTime'];

  resetPasswordToken: (Scalars['String'] | null);

  emailVerificationToken: (Scalars['String'] | null);

  roles: Role[];

  email: Scalars['EmailAddress'];

  googleProfileId: (Scalars['String'] | null);

  emailVerificationTokenExpiration: (Scalars['DateTime'] | null);

  lastSignedIn: (Scalars['DateTime'] | null);

  firstName: (Scalars['String'] | null);

  emailVerified: (Scalars['Boolean'] | null);

  resetPasswordTokenExpiration: (Scalars['DateTime'] | null);

  lastName: (Scalars['String'] | null);

  googleImageUrl: (Scalars['URL'] | null);

  /** Get all the fields for this record. Useful for not having to list out all the fields you want to retrieve, but slower. */
  _all: Scalars['JSONObject'];
};



export type AvailableUserSelection = {

  __typename?: boolean | null | undefined;

  /** The globally unique, unchanging identifier for this record. Assigned and managed by Gadget. */
  id?: boolean | null | undefined;

  /** The time at which this record was first created. Set once upon record creation and never changed. Managed by Gadget. */
  createdAt?: boolean | null | undefined;

  /** The time at which this record was last changed. Set each time the record is successfully acted upon by an action. Managed by Gadget. */
  updatedAt?: boolean | null | undefined;

  resetPasswordToken?: boolean | null | undefined;

  emailVerificationToken?: boolean | null | undefined;

  roles?: AvailableRoleSelection;

  email?: boolean | null | undefined;

  googleProfileId?: boolean | null | undefined;

  emailVerificationTokenExpiration?: boolean | null | undefined;

  lastSignedIn?: boolean | null | undefined;

  firstName?: boolean | null | undefined;

  emailVerified?: boolean | null | undefined;

  resetPasswordTokenExpiration?: boolean | null | undefined;

  lastName?: boolean | null | undefined;

  googleImageUrl?: boolean | null | undefined;

  /** Get all the fields for this record. Useful for not having to list out all the fields you want to retrieve, but slower. */
  _all?: boolean | null | undefined;
};


/** A named group of permissions granted to a particular actor in the system. Managed in the Gadget editor. */
export type Role = {

  __typename: 'Role';

  /** The stable identifier for this role. Null if the role has since been deleted. */
  key: Scalars['String'];

  /** The human readable name for this role. Can be changed. */
  name: Scalars['String'];
};



export type AvailableRoleSelection = {

  __typename?: boolean | null | undefined;

  /** The stable identifier for this role. Null if the role has since been deleted. */
  key?: boolean | null | undefined;

  /** The human readable name for this role. Can be changed. */
  name?: boolean | null | undefined;
};


/** A connection to a list of User items. */
export type UserConnection = {

  __typename: 'UserConnection';

  /** A list of edges. */
  edges: UserEdge[];

  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};



export type AvailableUserConnectionSelection = {

  __typename?: boolean | null | undefined;

  /** A list of edges. */
  edges?: AvailableUserEdgeSelection;

  /** Information to aid in pagination. */
  pageInfo?: AvailablePageInfoSelection;
};


/** An edge in a User connection. */
export type UserEdge = {

  __typename: 'UserEdge';

  /** The item at the end of the edge */
  node: User;

  /** A cursor for use in pagination */
  cursor: Scalars['String'];
};



export type AvailableUserEdgeSelection = {

  __typename?: boolean | null | undefined;

  /** The item at the end of the edge */
  node?: AvailableUserSelection;

  /** A cursor for use in pagination */
  cursor?: boolean | null | undefined;
};


/** Information about pagination in a connection. */
export type PageInfo = {

  __typename: 'PageInfo';

  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars['Boolean'];

  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars['Boolean'];

  /** When paginating backwards, the cursor to continue. */
  startCursor: (Scalars['String'] | null);

  /** When paginating forwards, the cursor to continue. */
  endCursor: (Scalars['String'] | null);
};



export type AvailablePageInfoSelection = {

  __typename?: boolean | null | undefined;

  /** When paginating forwards, are there more items? */
  hasNextPage?: boolean | null | undefined;

  /** When paginating backwards, are there more items? */
  hasPreviousPage?: boolean | null | undefined;

  /** When paginating backwards, the cursor to continue. */
  startCursor?: boolean | null | undefined;

  /** When paginating forwards, the cursor to continue. */
  endCursor?: boolean | null | undefined;
};



export type Session = {

  __typename: 'Session';

  /** The globally unique, unchanging identifier for this record. Assigned and managed by Gadget. */
  id: (Scalars['GadgetID'] | null);

  /** The time at which this record was first created. Set once upon record creation and never changed. Managed by Gadget. */
  createdAt: Scalars['DateTime'];

  /** The time at which this record was last changed. Set each time the record is successfully acted upon by an action. Managed by Gadget. */
  updatedAt: Scalars['DateTime'];

  /** The current state this record is in. Changed by invoking actions. Managed by Gadget. */
  state: Scalars['RecordState'];

  user: (User | null);

  userId: (Scalars['GadgetID'] | null);

  /** Get all the fields for this record. Useful for not having to list out all the fields you want to retrieve, but slower. */
  _all: Scalars['JSONObject'];
};



export type AvailableSessionSelection = {

  __typename?: boolean | null | undefined;

  /** The globally unique, unchanging identifier for this record. Assigned and managed by Gadget. */
  id?: boolean | null | undefined;

  /** The time at which this record was first created. Set once upon record creation and never changed. Managed by Gadget. */
  createdAt?: boolean | null | undefined;

  /** The time at which this record was last changed. Set each time the record is successfully acted upon by an action. Managed by Gadget. */
  updatedAt?: boolean | null | undefined;

  /** The current state this record is in. Changed by invoking actions. Managed by Gadget. */
  state?: boolean | null | undefined;

  user?: AvailableUserSelection;

  userId?: boolean | null | undefined;

  /** Get all the fields for this record. Useful for not having to list out all the fields you want to retrieve, but slower. */
  _all?: boolean | null | undefined;
};


/** A connection to a list of Session items. */
export type SessionConnection = {

  __typename: 'SessionConnection';

  /** A list of edges. */
  edges: SessionEdge[];

  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};



export type AvailableSessionConnectionSelection = {

  __typename?: boolean | null | undefined;

  /** A list of edges. */
  edges?: AvailableSessionEdgeSelection;

  /** Information to aid in pagination. */
  pageInfo?: AvailablePageInfoSelection;
};


/** An edge in a Session connection. */
export type SessionEdge = {

  __typename: 'SessionEdge';

  /** The item at the end of the edge */
  node: Session;

  /** A cursor for use in pagination */
  cursor: Scalars['String'];
};



export type AvailableSessionEdgeSelection = {

  __typename?: boolean | null | undefined;

  /** The item at the end of the edge */
  node?: AvailableSessionSelection;

  /** A cursor for use in pagination */
  cursor?: boolean | null | undefined;
};



export type InternalQueries = {

  __typename: 'InternalQueries';

  user: (InternalUserRecord | null);

  listUser: InternalUserRecordConnection;

  session: (InternalSessionRecord | null);

  listSession: InternalSessionRecordConnection;

  /** Currently open platform transaction details, or null if no transaction is open */
  currentTransactionDetails: (Scalars['JSONObject'] | null);
};



export type AvailableInternalQueriesSelection = {

  __typename?: boolean | null | undefined;

  user?: boolean | null | undefined;

  listUser?: AvailableInternalUserRecordConnectionSelection;

  session?: boolean | null | undefined;

  listSession?: AvailableInternalSessionRecordConnectionSelection;

  /** Currently open platform transaction details, or null if no transaction is open */
  currentTransactionDetails?: boolean | null | undefined;
};


/** A connection to a list of InternalUserRecord items. */
export type InternalUserRecordConnection = {

  __typename: 'InternalUserRecordConnection';

  /** A list of edges. */
  edges: InternalUserRecordEdge[];

  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};



export type AvailableInternalUserRecordConnectionSelection = {

  __typename?: boolean | null | undefined;

  /** A list of edges. */
  edges?: AvailableInternalUserRecordEdgeSelection;

  /** Information to aid in pagination. */
  pageInfo?: AvailablePageInfoSelection;
};


/** An edge in a InternalUserRecord connection. */
export type InternalUserRecordEdge = {

  __typename: 'InternalUserRecordEdge';

  /** The item at the end of the edge */
  node: InternalUserRecord;

  /** A cursor for use in pagination */
  cursor: Scalars['String'];
};



export type AvailableInternalUserRecordEdgeSelection = {

  __typename?: boolean | null | undefined;

  /** The item at the end of the edge */
  node?: boolean | null | undefined;

  /** A cursor for use in pagination */
  cursor?: boolean | null | undefined;
};


/** A connection to a list of InternalSessionRecord items. */
export type InternalSessionRecordConnection = {

  __typename: 'InternalSessionRecordConnection';

  /** A list of edges. */
  edges: InternalSessionRecordEdge[];

  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};



export type AvailableInternalSessionRecordConnectionSelection = {

  __typename?: boolean | null | undefined;

  /** A list of edges. */
  edges?: AvailableInternalSessionRecordEdgeSelection;

  /** Information to aid in pagination. */
  pageInfo?: AvailablePageInfoSelection;
};


/** An edge in a InternalSessionRecord connection. */
export type InternalSessionRecordEdge = {

  __typename: 'InternalSessionRecordEdge';

  /** The item at the end of the edge */
  node: InternalSessionRecord;

  /** A cursor for use in pagination */
  cursor: Scalars['String'];
};



export type AvailableInternalSessionRecordEdgeSelection = {

  __typename?: boolean | null | undefined;

  /** The item at the end of the edge */
  node?: boolean | null | undefined;

  /** A cursor for use in pagination */
  cursor?: boolean | null | undefined;
};


/** Represents one of the roles an identity in the system can be entitled to */
export type GadgetRole = {

  __typename: 'GadgetRole';

  key: Scalars['String'];

  name: Scalars['String'];

  selectable: Scalars['Boolean'];

  order: Scalars['Int'];
};



export type AvailableGadgetRoleSelection = {

  __typename?: boolean | null | undefined;

  key?: boolean | null | undefined;

  name?: boolean | null | undefined;

  selectable?: boolean | null | undefined;

  order?: boolean | null | undefined;
};



export type GadgetGlobalAction = {

  __typename: 'GadgetGlobalAction';

  name: Scalars['String'];

  apiIdentifier: Scalars['String'];

  requiresInput: Scalars['Boolean'];

  acceptsInput: Scalars['Boolean'];

  triggers: GadgetTrigger[];

  examples: (GadgetGlobalActionGraphQLType | null);
};



export type AvailableGadgetGlobalActionSelection = {

  __typename?: boolean | null | undefined;

  name?: boolean | null | undefined;

  apiIdentifier?: boolean | null | undefined;

  requiresInput?: boolean | null | undefined;

  acceptsInput?: boolean | null | undefined;

  triggers?: AvailableGadgetTriggerSelection;

  examples?: AvailableGadgetGlobalActionGraphQLTypeSelection;
};



export type GadgetGlobalActionGraphQLType = {

  __typename: 'GadgetGlobalActionGraphQLType';

  /** @deprecated moved to exampleGraphQLMutation */
  exampleMutation: Scalars['String'];

  exampleGraphQLMutation: Scalars['String'];

  inputGraphQLTypeSDL: (Scalars['String'] | null);

  outputGraphQLTypeSDL: Scalars['String'];

  inputTypeScriptInterface: (Scalars['String'] | null);

  outputTypeScriptInterface: Scalars['String'];

  exampleGraphQLVariables: Scalars['JSON'];

  exampleJSInputs: Scalars['JSON'];

  exampleImperativeInvocation: Scalars['String'];

  exampleReactHook: Scalars['String'];
};



export type AvailableGadgetGlobalActionGraphQLTypeSelection = {

  __typename?: boolean | null | undefined;

  /** @deprecated moved to exampleGraphQLMutation */
  exampleMutation?: boolean | null | undefined;

  exampleGraphQLMutation?: boolean | null | undefined;

  inputGraphQLTypeSDL?: boolean | null | undefined;

  outputGraphQLTypeSDL?: boolean | null | undefined;

  inputTypeScriptInterface?: boolean | null | undefined;

  outputTypeScriptInterface?: boolean | null | undefined;

  exampleGraphQLVariables?: boolean | null | undefined;

  exampleJSInputs?: boolean | null | undefined;

  exampleImperativeInvocation?: boolean | null | undefined;

  exampleReactHook?: boolean | null | undefined;
};


/** One upload target to use for the Direct Upload style of sending files to Gadget */
export type DirectUploadToken = {

  __typename: 'DirectUploadToken';

  /** The URL to upload a file to. */
  url: Scalars['String'];

  /** The token to pass to an action to reference the uploaded file. */
  token: Scalars['String'];
};



export type AvailableDirectUploadTokenSelection = {

  __typename?: boolean | null | undefined;

  /** The URL to upload a file to. */
  url?: boolean | null | undefined;

  /** The token to pass to an action to reference the uploaded file. */
  token?: boolean | null | undefined;
};



export type Mutation = {

  __typename: 'Mutation';

  signUpUser: (SignUpUserResult | null);

  bulkSignUpUsers: (BulkSignUpUsersResult | null);

  signInUser: (SignInUserResult | null);

  bulkSignInUsers: (BulkSignInUsersResult | null);

  signOutUser: (SignOutUserResult | null);

  bulkSignOutUsers: (BulkSignOutUsersResult | null);

  updateUser: (UpdateUserResult | null);

  bulkUpdateUsers: (BulkUpdateUsersResult | null);

  deleteUser: (DeleteUserResult | null);

  bulkDeleteUsers: (BulkDeleteUsersResult | null);

  sendVerifyEmailUser: (SendVerifyEmailUserResult | null);

  bulkSendVerifyEmailUsers: (BulkSendVerifyEmailUsersResult | null);

  verifyEmailUser: (VerifyEmailUserResult | null);

  bulkVerifyEmailUsers: (BulkVerifyEmailUsersResult | null);

  sendResetPasswordUser: (SendResetPasswordUserResult | null);

  bulkSendResetPasswordUsers: (BulkSendResetPasswordUsersResult | null);

  resetPasswordUser: (ResetPasswordUserResult | null);

  bulkResetPasswordUsers: (BulkResetPasswordUsersResult | null);

  changePasswordUser: (ChangePasswordUserResult | null);

  bulkChangePasswordUsers: (BulkChangePasswordUsersResult | null);

  internal: (InternalMutations | null);
};



export type AvailableMutationSelection = {

  __typename?: boolean | null | undefined;

  signUpUser?: AvailableSignUpUserResultSelection;

  bulkSignUpUsers?: AvailableBulkSignUpUsersResultSelection;

  signInUser?: AvailableSignInUserResultSelection;

  bulkSignInUsers?: AvailableBulkSignInUsersResultSelection;

  signOutUser?: AvailableSignOutUserResultSelection;

  bulkSignOutUsers?: AvailableBulkSignOutUsersResultSelection;

  updateUser?: AvailableUpdateUserResultSelection;

  bulkUpdateUsers?: AvailableBulkUpdateUsersResultSelection;

  deleteUser?: AvailableDeleteUserResultSelection;

  bulkDeleteUsers?: AvailableBulkDeleteUsersResultSelection;

  sendVerifyEmailUser?: AvailableSendVerifyEmailUserResultSelection;

  bulkSendVerifyEmailUsers?: AvailableBulkSendVerifyEmailUsersResultSelection;

  verifyEmailUser?: AvailableVerifyEmailUserResultSelection;

  bulkVerifyEmailUsers?: AvailableBulkVerifyEmailUsersResultSelection;

  sendResetPasswordUser?: AvailableSendResetPasswordUserResultSelection;

  bulkSendResetPasswordUsers?: AvailableBulkSendResetPasswordUsersResultSelection;

  resetPasswordUser?: AvailableResetPasswordUserResultSelection;

  bulkResetPasswordUsers?: AvailableBulkResetPasswordUsersResultSelection;

  changePasswordUser?: AvailableChangePasswordUserResultSelection;

  bulkChangePasswordUsers?: AvailableBulkChangePasswordUsersResultSelection;

  internal?: AvailableInternalMutationsSelection;
};



export type SignUpUserResult = {

  __typename: 'SignUpUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  result: (Scalars['JSON'] | null);
};



export type AvailableSignUpUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  result?: boolean | null | undefined;
};


/** The output when running the signUp on the user model in bulk. */
export type BulkSignUpUsersResult = {

  __typename: 'BulkSignUpUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results: (Scalars['JSON'] | null)[];
};



export type AvailableBulkSignUpUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results?: boolean | null | undefined;
};



export type SignInUserResult = {

  __typename: 'SignInUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  user: (User | null);
};



export type AvailableSignInUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  user?: AvailableUserSelection;
};


/** The output when running the signIn on the user model in bulk. */
export type BulkSignInUsersResult = {

  __typename: 'BulkSignInUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];

  /** The list of all changed user records by each sent bulk action. Returned in the same order as the input bulk action params. */
  users: (User | null)[];
};



export type AvailableBulkSignInUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;

  /** The list of all changed user records by each sent bulk action. Returned in the same order as the input bulk action params. */
  users?: AvailableUserSelection;
};



export type SignOutUserResult = {

  __typename: 'SignOutUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  user: (User | null);
};



export type AvailableSignOutUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  user?: AvailableUserSelection;
};


/** The output when running the signOut on the user model in bulk. */
export type BulkSignOutUsersResult = {

  __typename: 'BulkSignOutUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];

  /** The list of all changed user records by each sent bulk action. Returned in the same order as the input bulk action params. */
  users: (User | null)[];
};



export type AvailableBulkSignOutUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;

  /** The list of all changed user records by each sent bulk action. Returned in the same order as the input bulk action params. */
  users?: AvailableUserSelection;
};



export type UpdateUserResult = {

  __typename: 'UpdateUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  user: (User | null);
};



export type AvailableUpdateUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  user?: AvailableUserSelection;
};


/** The output when running the update on the user model in bulk. */
export type BulkUpdateUsersResult = {

  __typename: 'BulkUpdateUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];

  /** The list of all changed user records by each sent bulk action. Returned in the same order as the input bulk action params. */
  users: (User | null)[];
};



export type AvailableBulkUpdateUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;

  /** The list of all changed user records by each sent bulk action. Returned in the same order as the input bulk action params. */
  users?: AvailableUserSelection;
};



export type DeleteUserResult = {

  __typename: 'DeleteUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];
};



export type AvailableDeleteUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;
};


/** The output when running the delete on the user model in bulk. */
export type BulkDeleteUsersResult = {

  __typename: 'BulkDeleteUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];
};



export type AvailableBulkDeleteUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;
};



export type SendVerifyEmailUserResult = {

  __typename: 'SendVerifyEmailUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  result: (Scalars['JSON'] | null);
};



export type AvailableSendVerifyEmailUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  result?: boolean | null | undefined;
};


/** The output when running the sendVerifyEmail on the user model in bulk. */
export type BulkSendVerifyEmailUsersResult = {

  __typename: 'BulkSendVerifyEmailUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results: (Scalars['JSON'] | null)[];
};



export type AvailableBulkSendVerifyEmailUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results?: boolean | null | undefined;
};



export type VerifyEmailUserResult = {

  __typename: 'VerifyEmailUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  result: (Scalars['JSON'] | null);
};



export type AvailableVerifyEmailUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  result?: boolean | null | undefined;
};


/** The output when running the verifyEmail on the user model in bulk. */
export type BulkVerifyEmailUsersResult = {

  __typename: 'BulkVerifyEmailUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results: (Scalars['JSON'] | null)[];
};



export type AvailableBulkVerifyEmailUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results?: boolean | null | undefined;
};



export type SendResetPasswordUserResult = {

  __typename: 'SendResetPasswordUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  result: (Scalars['JSON'] | null);
};



export type AvailableSendResetPasswordUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  result?: boolean | null | undefined;
};


/** The output when running the sendResetPassword on the user model in bulk. */
export type BulkSendResetPasswordUsersResult = {

  __typename: 'BulkSendResetPasswordUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results: (Scalars['JSON'] | null)[];
};



export type AvailableBulkSendResetPasswordUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results?: boolean | null | undefined;
};



export type ResetPasswordUserResult = {

  __typename: 'ResetPasswordUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  result: (Scalars['JSON'] | null);
};



export type AvailableResetPasswordUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  result?: boolean | null | undefined;
};


/** The output when running the resetPassword on the user model in bulk. */
export type BulkResetPasswordUsersResult = {

  __typename: 'BulkResetPasswordUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results: (Scalars['JSON'] | null)[];
};



export type AvailableBulkResetPasswordUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;

  /** The list of returned values for each action executed in the set of bulk actions. Returned in the same order as the input bulk action params. */
  results?: boolean | null | undefined;
};



export type ChangePasswordUserResult = {

  __typename: 'ChangePasswordUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  user: (User | null);
};



export type AvailableChangePasswordUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  user?: AvailableUserSelection;
};


/** The output when running the changePassword on the user model in bulk. */
export type BulkChangePasswordUsersResult = {

  __typename: 'BulkChangePasswordUsersResult';

  /** Boolean describing if all the bulk actions succeeded or not */
  success: Scalars['Boolean'];

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors: ExecutionError[];

  /** The list of all changed user records by each sent bulk action. Returned in the same order as the input bulk action params. */
  users: (User | null)[];
};



export type AvailableBulkChangePasswordUsersResultSelection = {

  __typename?: boolean | null | undefined;

  /** Boolean describing if all the bulk actions succeeded or not */
  success?: boolean | null | undefined;

  /** Aggregated list of errors that any bulk action encountered while processing */
  errors?: AvailableExecutionErrorSelection;

  /** The list of all changed user records by each sent bulk action. Returned in the same order as the input bulk action params. */
  users?: AvailableUserSelection;
};



export type InternalMutations = {

  __typename: 'InternalMutations';

  startTransaction: Scalars['String'];

  commitTransaction: Scalars['String'];

  rollbackTransaction: Scalars['String'];

  /** Acquire a backend lock, returning only once the lock has been acquired */
  acquireLock: LockOperationResult;

  createUser: (InternalCreateUserResult | null);

  updateUser: (InternalUpdateUserResult | null);

  deleteUser: (InternalDeleteUserResult | null);

  deleteManyUser: (InternalDeleteManyUserResult | null);

  bulkCreateUsers: (InternalBulkCreateUsersResult | null);

  triggerSignUpUser: (SignUpUserResult | null);

  triggerSignInUser: (SignInUserResult | null);

  triggerSignOutUser: (SignOutUserResult | null);

  triggerUpdateUser: (UpdateUserResult | null);

  triggerDeleteUser: (DeleteUserResult | null);

  triggerSendVerifyEmailUser: (SendVerifyEmailUserResult | null);

  triggerVerifyEmailUser: (VerifyEmailUserResult | null);

  triggerSendResetPasswordUser: (SendResetPasswordUserResult | null);

  triggerResetPasswordUser: (ResetPasswordUserResult | null);

  triggerChangePasswordUser: (ChangePasswordUserResult | null);

  createSession: (InternalCreateSessionResult | null);

  updateSession: (InternalUpdateSessionResult | null);

  deleteSession: (InternalDeleteSessionResult | null);

  deleteManySession: (InternalDeleteManySessionResult | null);

  bulkCreateSessions: (InternalBulkCreateSessionsResult | null);
};



export type AvailableInternalMutationsSelection = {

  __typename?: boolean | null | undefined;

  startTransaction?: boolean | null | undefined;

  commitTransaction?: boolean | null | undefined;

  rollbackTransaction?: boolean | null | undefined;

  /** Acquire a backend lock, returning only once the lock has been acquired */
  acquireLock?: AvailableLockOperationResultSelection;

  createUser?: AvailableInternalCreateUserResultSelection;

  updateUser?: AvailableInternalUpdateUserResultSelection;

  deleteUser?: AvailableInternalDeleteUserResultSelection;

  deleteManyUser?: AvailableInternalDeleteManyUserResultSelection;

  bulkCreateUsers?: AvailableInternalBulkCreateUsersResultSelection;

  triggerSignUpUser?: AvailableSignUpUserResultSelection;

  triggerSignInUser?: AvailableSignInUserResultSelection;

  triggerSignOutUser?: AvailableSignOutUserResultSelection;

  triggerUpdateUser?: AvailableUpdateUserResultSelection;

  triggerDeleteUser?: AvailableDeleteUserResultSelection;

  triggerSendVerifyEmailUser?: AvailableSendVerifyEmailUserResultSelection;

  triggerVerifyEmailUser?: AvailableVerifyEmailUserResultSelection;

  triggerSendResetPasswordUser?: AvailableSendResetPasswordUserResultSelection;

  triggerResetPasswordUser?: AvailableResetPasswordUserResultSelection;

  triggerChangePasswordUser?: AvailableChangePasswordUserResultSelection;

  createSession?: AvailableInternalCreateSessionResultSelection;

  updateSession?: AvailableInternalUpdateSessionResultSelection;

  deleteSession?: AvailableInternalDeleteSessionResultSelection;

  deleteManySession?: AvailableInternalDeleteManySessionResultSelection;

  bulkCreateSessions?: AvailableInternalBulkCreateSessionsResultSelection;
};



export type LockOperationResult = {

  __typename: 'LockOperationResult';

  /** Whether the lock operation succeeded */
  success: Scalars['Boolean'];

  /** Any errors encountered during the locking/unlocking operation */
  errors: ExecutionError[];
};



export type AvailableLockOperationResultSelection = {

  __typename?: boolean | null | undefined;

  /** Whether the lock operation succeeded */
  success?: boolean | null | undefined;

  /** Any errors encountered during the locking/unlocking operation */
  errors?: AvailableExecutionErrorSelection;
};



export type InternalCreateUserResult = {

  __typename: 'InternalCreateUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  user: (InternalUserRecord | null);
};



export type AvailableInternalCreateUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  user?: boolean | null | undefined;
};



export type InternalUpdateUserResult = {

  __typename: 'InternalUpdateUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  user: (InternalUserRecord | null);
};



export type AvailableInternalUpdateUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  user?: boolean | null | undefined;
};



export type InternalDeleteUserResult = {

  __typename: 'InternalDeleteUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  user: (InternalUserRecord | null);
};



export type AvailableInternalDeleteUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  user?: boolean | null | undefined;
};



export type InternalDeleteManyUserResult = {

  __typename: 'InternalDeleteManyUserResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];
};



export type AvailableInternalDeleteManyUserResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;
};



export type InternalBulkCreateUsersResult = {

  __typename: 'InternalBulkCreateUsersResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  users: (InternalUserRecord | null)[];
};



export type AvailableInternalBulkCreateUsersResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  users?: boolean | null | undefined;
};



export type InternalCreateSessionResult = {

  __typename: 'InternalCreateSessionResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  session: (InternalSessionRecord | null);
};



export type AvailableInternalCreateSessionResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  session?: boolean | null | undefined;
};



export type InternalUpdateSessionResult = {

  __typename: 'InternalUpdateSessionResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  session: (InternalSessionRecord | null);
};



export type AvailableInternalUpdateSessionResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  session?: boolean | null | undefined;
};



export type InternalDeleteSessionResult = {

  __typename: 'InternalDeleteSessionResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  session: (InternalSessionRecord | null);
};



export type AvailableInternalDeleteSessionResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  session?: boolean | null | undefined;
};



export type InternalDeleteManySessionResult = {

  __typename: 'InternalDeleteManySessionResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];
};



export type AvailableInternalDeleteManySessionResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;
};



export type InternalBulkCreateSessionsResult = {

  __typename: 'InternalBulkCreateSessionsResult';

  success: Scalars['Boolean'];

  errors: ExecutionError[];

  sessions: (InternalSessionRecord | null)[];
};



export type AvailableInternalBulkCreateSessionsResultSelection = {

  __typename?: boolean | null | undefined;

  success?: boolean | null | undefined;

  errors?: AvailableExecutionErrorSelection;

  sessions?: boolean | null | undefined;
};



export type ExplicitNestingRequired = never;

export type DeepFilterNever<T> = T extends Record<string, unknown> ? FilterNever<{
  [Key in keyof T]: T[Key] extends Record<string, unknown> ? DeepFilterNever<T[Key]> : T[Key];
}> : T;

export type Select<Schema, Selection extends FieldSelection | null | undefined> = Selection extends null | undefined
  ? never
  : Schema extends (infer T)[]
  ? Select<T, Selection>[]
  : Schema extends null
  ? Select<Exclude<Schema, null>, Selection> | null
  : {
      [Key in keyof Selection & keyof Schema]: Selection[Key] extends true
        ? Schema[Key]
        : Selection[Key] extends FieldSelection
        ? Select<Schema[Key], Selection[Key]>
        : never;
    };

export type IDsList = {
  ids: string[];
}
