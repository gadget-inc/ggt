import {
  GadgetConnection,
  GadgetRecord,
  GadgetRecordImplementation,
  GadgetRecordList,
  GadgetNonUniqueDataError,
  actionRunner,
  findManyRunner,
  findOneRunner,
  findOneByFieldRunner,
  DefaultSelection,
  LimitToKnownKeys,
  Selectable
} from "@gadgetinc/api-client-core";

import {
  Query,
  ExplicitNestingRequired,
  Select,
  DeepFilterNever,
  IDsList,
      User,
      UserSort,
      UserFilter,
      AvailableUserSelection,
      Scalars,
      SignOutUserInput,
      UpdateUserInput,
  
} from "../types.js";

import { disambiguateActionParams } from "../support.js";

export const DefaultUserSelection = {
  "__typename": true,
  "createdAt": true,
  "email": true,
  "emailVerificationToken": true,
  "emailVerificationTokenExpiration": true,
  "emailVerified": true,
  "firstName": true,
  "googleImageUrl": true,
  "googleProfileId": true,
  "id": true,
  "lastName": true,
  "lastSignedIn": true,
  "resetPasswordToken": true,
  "resetPasswordTokenExpiration": true,
  "roles": {
    "key": true,
    "name": true
  },
  "updatedAt": true
} as const;

/**
* Produce a type that holds only the selected fields (and nested fields) of "user". The present fields in the result type of this are dynamic based on the options to each call that uses it.
* The selected fields are sometimes given by the `Options` at `Options["select"]`, and if a selection isn't made in the options, we use the default selection from above.
*/
export type SelectedUserOrDefault<Options extends Selectable<AvailableUserSelection>> = DeepFilterNever<
  Select<
    User,
    DefaultSelection<
      AvailableUserSelection,
      Options,
      typeof DefaultUserSelection
    >
  >>;

/** Options that can be passed to the `UserManager#findOne` method */
export interface FindOneUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};

/** Options that can be passed to the `UserManager#maybeFindOne` method */
export interface MaybeFindOneUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};

/** Options that can be passed to the `UserManager#findMany` method */
export interface FindManyUsersOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
  /** Return records sorted by these sorts */
  sort?: UserSort | UserSort[] | null;
  /** Only return records matching these filters. */
  filter?: UserFilter | UserFilter[] | null;
  /** Only return records matching this freeform search string */
  search?: string | null;
  first?: number | null;
  last?: number | null;
  after?: string | null;
  before?: string | null;
};

/** Options that can be passed to the `UserManager#findFirst` method */
export interface FindFirstUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
  /** Return records sorted by these sorts */
  sort?: UserSort | UserSort[] | null;
  /** Only return records matching these filters. */
  filter?: UserFilter | UserFilter[] | null;
  /** Only return records matching this freeform search string */
  search?: string | null;
};

/** Options that can be passed to the `UserManager#maybeFindFirst` method */
export interface MaybeFindFirstUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
  /** Return records sorted by these sorts */
  sort?: UserSort | UserSort[] | null;
  /** Only return records matching these filters. */
  filter?: UserFilter | UserFilter[] | null;
  /** Only return records matching this freeform search string */
  search?: string | null;
};


export interface SignUpUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};


export interface SignInUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};


export interface SignOutUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};


export interface UpdateUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};


export interface DeleteUserOptions {
};


export interface SendVerifyEmailUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};


export interface VerifyEmailUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};


export interface SendResetPasswordUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};


export interface ResetPasswordUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};


export interface ChangePasswordUserOptions {
  /** Select fields other than the defaults of the record to return */
  select?: AvailableUserSelection;
};


const apiIdentifier = "user";
const pluralApiIdentifier = "users";


    
  /**
   * The fully-qualified, expanded form of the inputs for executing this action.
   * The flattened style should be preferred over this style, but for models with ambiguous API identifiers, this style can be used to remove any ambiguity.
   **/
  export type FullyQualifiedSignUpUserVariables = {
          email: (Scalars['String'] | null) | null,
          password: (Scalars['String'] | null) | null,
      }

  /**
   * The inputs for executing signUp on user.
   * This is the flattened style of inputs, suitable for general use, and should be preferred.
   **/

    export type SignUpUserVariables = FullyQualifiedSignUpUserVariables;



/**
 * The return value from executing signUp on user.
 * ""
 **/
export type SignUpUserResult<Options extends SignUpUserOptions> =
  any
;


/**
  * Executes the signUp action. Accepts the parameters for the action via the `variables` argument. Runs the action and returns a Promise for the updated record.
  */

// Flat style overload
async function signUpUser<Options extends SignUpUserOptions>(
  
    variables: SignUpUserVariables,

  options?: LimitToKnownKeys<Options, SignUpUserOptions>
): Promise<SignUpUserResult<Options>>;

// Fully qualified, nested api identifier overload
async function signUpUser<Options extends SignUpUserOptions>(
  
      variables: FullyQualifiedSignUpUserVariables,
  
  options?: LimitToKnownKeys<Options, SignUpUserOptions>
): Promise<SignUpUserResult<Options>>;

// Function implementation
async function signUpUser<Options extends SignUpUserOptions>(
  this: UserManager,
  
      variables: SignUpUserVariables | FullyQualifiedSignUpUserVariables,
  
  options?: LimitToKnownKeys<Options, SignUpUserOptions>
): Promise<SignUpUserResult<Options>> {
    const newVariables = disambiguateActionParams(
      this["signUp"],
       undefined,
      variables
    );

  return (await actionRunner<SelectedUserOrDefault<Options>>(
    this,
    "signUpUser",
    DefaultUserSelection,
    apiIdentifier,
    apiIdentifier,
    false,
    {
                    "email": {
          value: newVariables.email,
          required: true,
          type: "String",
        },
              "password": {
          value: newVariables.password,
          required: true,
          type: "String",
        },
          },
    options,
    null,
    true
  ));
}

  
    
  /**
   * The fully-qualified, expanded form of the inputs for executing this action.
   * The flattened style should be preferred over this style, but for models with ambiguous API identifiers, this style can be used to remove any ambiguity.
   **/
  export type FullyQualifiedSignInUserVariables = {
          email: (Scalars['String'] | null) | null,
          password: (Scalars['String'] | null) | null,
      }

  /**
   * The inputs for executing signIn on user.
   * This is the flattened style of inputs, suitable for general use, and should be preferred.
   **/

    export type SignInUserVariables = FullyQualifiedSignInUserVariables;



/**
 * The return value from executing signIn on user.
 * "Is a GadgetRecord of the model's type."
 **/
export type SignInUserResult<Options extends SignInUserOptions> =
  SelectedUserOrDefault<Options> extends void ? void : GadgetRecord<SelectedUserOrDefault<Options>>
;


/**
  * Executes the signIn action. Accepts the parameters for the action via the `variables` argument. Runs the action and returns a Promise for the updated record.
  */

// Flat style overload
async function signInUser<Options extends SignInUserOptions>(
  
    variables: SignInUserVariables,

  options?: LimitToKnownKeys<Options, SignInUserOptions>
): Promise<SignInUserResult<Options>>;

// Fully qualified, nested api identifier overload
async function signInUser<Options extends SignInUserOptions>(
  
      variables: FullyQualifiedSignInUserVariables,
  
  options?: LimitToKnownKeys<Options, SignInUserOptions>
): Promise<SignInUserResult<Options>>;

// Function implementation
async function signInUser<Options extends SignInUserOptions>(
  this: UserManager,
  
      variables: SignInUserVariables | FullyQualifiedSignInUserVariables,
  
  options?: LimitToKnownKeys<Options, SignInUserOptions>
): Promise<SignInUserResult<Options>> {
    const newVariables = disambiguateActionParams(
      this["signIn"],
       undefined,
      variables
    );

  return (await actionRunner<SelectedUserOrDefault<Options>>(
    this,
    "signInUser",
    DefaultUserSelection,
    apiIdentifier,
    apiIdentifier,
    false,
    {
                    "email": {
          value: newVariables.email,
          required: true,
          type: "String",
        },
              "password": {
          value: newVariables.password,
          required: true,
          type: "String",
        },
          },
    options,
    null,
    false
  ));
}

  
    
  /**
   * The fully-qualified, expanded form of the inputs for executing this action.
   * The flattened style should be preferred over this style, but for models with ambiguous API identifiers, this style can be used to remove any ambiguity.
   **/
  export type FullyQualifiedSignOutUserVariables = {
          user?: SignOutUserInput,
      }

  /**
   * The inputs for executing signOut on user.
   * This is the flattened style of inputs, suitable for general use, and should be preferred.
   **/

    export type SignOutUserVariables = SignOutUserInput;



/**
 * The return value from executing signOut on user.
 * "Is a GadgetRecord of the model's type."
 **/
export type SignOutUserResult<Options extends SignOutUserOptions> =
  SelectedUserOrDefault<Options> extends void ? void : GadgetRecord<SelectedUserOrDefault<Options>>
;


/**
  * Executes the signOut action on one record specified by `id`. Runs the action and returns a Promise for the updated record.
  */

// Flat style overload
async function signOutUser<Options extends SignOutUserOptions>(
  id: string,
    variables: SignOutUserVariables,

  options?: LimitToKnownKeys<Options, SignOutUserOptions>
): Promise<SignOutUserResult<Options>>;

// Fully qualified, nested api identifier overload
async function signOutUser<Options extends SignOutUserOptions>(
  id: string,
      variables: FullyQualifiedSignOutUserVariables,
  
  options?: LimitToKnownKeys<Options, SignOutUserOptions>
): Promise<SignOutUserResult<Options>>;

// Function implementation
async function signOutUser<Options extends SignOutUserOptions>(
  this: UserManager,
  id: string,
      variables: SignOutUserVariables | FullyQualifiedSignOutUserVariables,
  
  options?: LimitToKnownKeys<Options, SignOutUserOptions>
): Promise<SignOutUserResult<Options>> {
    const newVariables = disambiguateActionParams(
      this["signOut"],
       id,
      variables
    );

  return (await actionRunner<SelectedUserOrDefault<Options>>(
    this,
    "signOutUser",
    DefaultUserSelection,
    apiIdentifier,
    apiIdentifier,
    false,
    {
              id: {
          value: id,
          required: true,
          type: "GadgetID",
        },
                    "user": {
          value: newVariables.user,
          required: false,
          type: "SignOutUserInput",
        },
          },
    options,
    null,
    false
  ));
}

  
    
  /**
   * The fully-qualified, expanded form of the inputs for executing this action.
   * The flattened style should be preferred over this style, but for models with ambiguous API identifiers, this style can be used to remove any ambiguity.
   **/
  export type FullyQualifiedUpdateUserVariables = {
          user?: UpdateUserInput,
      }

  /**
   * The inputs for executing update on user.
   * This is the flattened style of inputs, suitable for general use, and should be preferred.
   **/

    export type UpdateUserVariables = UpdateUserInput;



/**
 * The return value from executing update on user.
 * "Is a GadgetRecord of the model's type."
 **/
export type UpdateUserResult<Options extends UpdateUserOptions> =
  SelectedUserOrDefault<Options> extends void ? void : GadgetRecord<SelectedUserOrDefault<Options>>
;


/**
  * Executes the update action on one record specified by `id`. Runs the action and returns a Promise for the updated record.
  */

// Flat style overload
async function updateUser<Options extends UpdateUserOptions>(
  id: string,
    variables: UpdateUserVariables,

  options?: LimitToKnownKeys<Options, UpdateUserOptions>
): Promise<UpdateUserResult<Options>>;

// Fully qualified, nested api identifier overload
async function updateUser<Options extends UpdateUserOptions>(
  id: string,
      variables: FullyQualifiedUpdateUserVariables,
  
  options?: LimitToKnownKeys<Options, UpdateUserOptions>
): Promise<UpdateUserResult<Options>>;

// Function implementation
async function updateUser<Options extends UpdateUserOptions>(
  this: UserManager,
  id: string,
      variables: UpdateUserVariables | FullyQualifiedUpdateUserVariables,
  
  options?: LimitToKnownKeys<Options, UpdateUserOptions>
): Promise<UpdateUserResult<Options>> {
    const newVariables = disambiguateActionParams(
      this["update"],
       id,
      variables
    );

  return (await actionRunner<SelectedUserOrDefault<Options>>(
    this,
    "updateUser",
    DefaultUserSelection,
    apiIdentifier,
    apiIdentifier,
    false,
    {
              id: {
          value: id,
          required: true,
          type: "GadgetID",
        },
                    "user": {
          value: newVariables.user,
          required: false,
          type: "UpdateUserInput",
        },
          },
    options,
    null,
    false
  ));
}

  
    

/**
 * The return value from executing delete on user.
 * "Is void because this action deletes the record"
 **/
export type DeleteUserResult<Options extends DeleteUserOptions> =
  void extends void ? void : GadgetRecord<SelectedUserOrDefault<Options>>
;


/**
  * Executes the delete action on one record specified by `id`. Deletes the record on the server. Returns a Promise that resolves if the delete succeeds.
  */

// Fully qualified, nested api identifier overload
async function deleteUser<Options extends DeleteUserOptions>(
  id: string,
  
  options?: LimitToKnownKeys<Options, DeleteUserOptions>
): Promise<DeleteUserResult<Options>>;

// Function implementation
async function deleteUser<Options extends DeleteUserOptions>(
  this: UserManager,
  id: string,
  
  options?: LimitToKnownKeys<Options, DeleteUserOptions>
): Promise<DeleteUserResult<Options>> {

  return (await actionRunner<void>(
    this,
    "deleteUser",
    null,
    apiIdentifier,
    apiIdentifier,
    false,
    {
              id: {
          value: id,
          required: true,
          type: "GadgetID",
        },
                },
    options,
    null,
    false
  ));
}

  
    
  /**
   * The fully-qualified, expanded form of the inputs for executing this action.
   * The flattened style should be preferred over this style, but for models with ambiguous API identifiers, this style can be used to remove any ambiguity.
   **/
  export type FullyQualifiedSendVerifyEmailUserVariables = {
          email: (Scalars['String'] | null) | null,
      }

  /**
   * The inputs for executing sendVerifyEmail on user.
   * This is the flattened style of inputs, suitable for general use, and should be preferred.
   **/

    export type SendVerifyEmailUserVariables = FullyQualifiedSendVerifyEmailUserVariables;



/**
 * The return value from executing sendVerifyEmail on user.
 * ""
 **/
export type SendVerifyEmailUserResult<Options extends SendVerifyEmailUserOptions> =
  any
;


/**
  * Executes the sendVerifyEmail action. Accepts the parameters for the action via the `variables` argument. Runs the action and returns a Promise for the updated record.
  */

// Flat style overload
async function sendVerifyEmailUser<Options extends SendVerifyEmailUserOptions>(
  
    variables: SendVerifyEmailUserVariables,

  options?: LimitToKnownKeys<Options, SendVerifyEmailUserOptions>
): Promise<SendVerifyEmailUserResult<Options>>;

// Fully qualified, nested api identifier overload
async function sendVerifyEmailUser<Options extends SendVerifyEmailUserOptions>(
  
      variables: FullyQualifiedSendVerifyEmailUserVariables,
  
  options?: LimitToKnownKeys<Options, SendVerifyEmailUserOptions>
): Promise<SendVerifyEmailUserResult<Options>>;

// Function implementation
async function sendVerifyEmailUser<Options extends SendVerifyEmailUserOptions>(
  this: UserManager,
  
      variables: SendVerifyEmailUserVariables | FullyQualifiedSendVerifyEmailUserVariables,
  
  options?: LimitToKnownKeys<Options, SendVerifyEmailUserOptions>
): Promise<SendVerifyEmailUserResult<Options>> {
    const newVariables = disambiguateActionParams(
      this["sendVerifyEmail"],
       undefined,
      variables
    );

  return (await actionRunner<SelectedUserOrDefault<Options>>(
    this,
    "sendVerifyEmailUser",
    DefaultUserSelection,
    apiIdentifier,
    apiIdentifier,
    false,
    {
                    "email": {
          value: newVariables.email,
          required: true,
          type: "String",
        },
          },
    options,
    null,
    true
  ));
}

  
    
  /**
   * The fully-qualified, expanded form of the inputs for executing this action.
   * The flattened style should be preferred over this style, but for models with ambiguous API identifiers, this style can be used to remove any ambiguity.
   **/
  export type FullyQualifiedVerifyEmailUserVariables = {
          code: (Scalars['String'] | null) | null,
      }

  /**
   * The inputs for executing verifyEmail on user.
   * This is the flattened style of inputs, suitable for general use, and should be preferred.
   **/

    export type VerifyEmailUserVariables = FullyQualifiedVerifyEmailUserVariables;



/**
 * The return value from executing verifyEmail on user.
 * ""
 **/
export type VerifyEmailUserResult<Options extends VerifyEmailUserOptions> =
  any
;


/**
  * Executes the verifyEmail action. Accepts the parameters for the action via the `variables` argument. Runs the action and returns a Promise for the updated record.
  */

// Flat style overload
async function verifyEmailUser<Options extends VerifyEmailUserOptions>(
  
    variables: VerifyEmailUserVariables,

  options?: LimitToKnownKeys<Options, VerifyEmailUserOptions>
): Promise<VerifyEmailUserResult<Options>>;

// Fully qualified, nested api identifier overload
async function verifyEmailUser<Options extends VerifyEmailUserOptions>(
  
      variables: FullyQualifiedVerifyEmailUserVariables,
  
  options?: LimitToKnownKeys<Options, VerifyEmailUserOptions>
): Promise<VerifyEmailUserResult<Options>>;

// Function implementation
async function verifyEmailUser<Options extends VerifyEmailUserOptions>(
  this: UserManager,
  
      variables: VerifyEmailUserVariables | FullyQualifiedVerifyEmailUserVariables,
  
  options?: LimitToKnownKeys<Options, VerifyEmailUserOptions>
): Promise<VerifyEmailUserResult<Options>> {
    const newVariables = disambiguateActionParams(
      this["verifyEmail"],
       undefined,
      variables
    );

  return (await actionRunner<SelectedUserOrDefault<Options>>(
    this,
    "verifyEmailUser",
    DefaultUserSelection,
    apiIdentifier,
    apiIdentifier,
    false,
    {
                    "code": {
          value: newVariables.code,
          required: true,
          type: "String",
        },
          },
    options,
    null,
    true
  ));
}

  
    
  /**
   * The fully-qualified, expanded form of the inputs for executing this action.
   * The flattened style should be preferred over this style, but for models with ambiguous API identifiers, this style can be used to remove any ambiguity.
   **/
  export type FullyQualifiedSendResetPasswordUserVariables = {
          email: (Scalars['String'] | null) | null,
      }

  /**
   * The inputs for executing sendResetPassword on user.
   * This is the flattened style of inputs, suitable for general use, and should be preferred.
   **/

    export type SendResetPasswordUserVariables = FullyQualifiedSendResetPasswordUserVariables;



/**
 * The return value from executing sendResetPassword on user.
 * ""
 **/
export type SendResetPasswordUserResult<Options extends SendResetPasswordUserOptions> =
  any
;


/**
  * Executes the sendResetPassword action. Accepts the parameters for the action via the `variables` argument. Runs the action and returns a Promise for the updated record.
  */

// Flat style overload
async function sendResetPasswordUser<Options extends SendResetPasswordUserOptions>(
  
    variables: SendResetPasswordUserVariables,

  options?: LimitToKnownKeys<Options, SendResetPasswordUserOptions>
): Promise<SendResetPasswordUserResult<Options>>;

// Fully qualified, nested api identifier overload
async function sendResetPasswordUser<Options extends SendResetPasswordUserOptions>(
  
      variables: FullyQualifiedSendResetPasswordUserVariables,
  
  options?: LimitToKnownKeys<Options, SendResetPasswordUserOptions>
): Promise<SendResetPasswordUserResult<Options>>;

// Function implementation
async function sendResetPasswordUser<Options extends SendResetPasswordUserOptions>(
  this: UserManager,
  
      variables: SendResetPasswordUserVariables | FullyQualifiedSendResetPasswordUserVariables,
  
  options?: LimitToKnownKeys<Options, SendResetPasswordUserOptions>
): Promise<SendResetPasswordUserResult<Options>> {
    const newVariables = disambiguateActionParams(
      this["sendResetPassword"],
       undefined,
      variables
    );

  return (await actionRunner<SelectedUserOrDefault<Options>>(
    this,
    "sendResetPasswordUser",
    DefaultUserSelection,
    apiIdentifier,
    apiIdentifier,
    false,
    {
                    "email": {
          value: newVariables.email,
          required: true,
          type: "String",
        },
          },
    options,
    null,
    true
  ));
}

  
    
  /**
   * The fully-qualified, expanded form of the inputs for executing this action.
   * The flattened style should be preferred over this style, but for models with ambiguous API identifiers, this style can be used to remove any ambiguity.
   **/
  export type FullyQualifiedResetPasswordUserVariables = {
          password: (Scalars['String'] | null) | null,
          code: (Scalars['String'] | null) | null,
      }

  /**
   * The inputs for executing resetPassword on user.
   * This is the flattened style of inputs, suitable for general use, and should be preferred.
   **/

    export type ResetPasswordUserVariables = FullyQualifiedResetPasswordUserVariables;



/**
 * The return value from executing resetPassword on user.
 * ""
 **/
export type ResetPasswordUserResult<Options extends ResetPasswordUserOptions> =
  any
;


/**
  * Executes the resetPassword action. Accepts the parameters for the action via the `variables` argument. Runs the action and returns a Promise for the updated record.
  */

// Flat style overload
async function resetPasswordUser<Options extends ResetPasswordUserOptions>(
  
    variables: ResetPasswordUserVariables,

  options?: LimitToKnownKeys<Options, ResetPasswordUserOptions>
): Promise<ResetPasswordUserResult<Options>>;

// Fully qualified, nested api identifier overload
async function resetPasswordUser<Options extends ResetPasswordUserOptions>(
  
      variables: FullyQualifiedResetPasswordUserVariables,
  
  options?: LimitToKnownKeys<Options, ResetPasswordUserOptions>
): Promise<ResetPasswordUserResult<Options>>;

// Function implementation
async function resetPasswordUser<Options extends ResetPasswordUserOptions>(
  this: UserManager,
  
      variables: ResetPasswordUserVariables | FullyQualifiedResetPasswordUserVariables,
  
  options?: LimitToKnownKeys<Options, ResetPasswordUserOptions>
): Promise<ResetPasswordUserResult<Options>> {
    const newVariables = disambiguateActionParams(
      this["resetPassword"],
       undefined,
      variables
    );

  return (await actionRunner<SelectedUserOrDefault<Options>>(
    this,
    "resetPasswordUser",
    DefaultUserSelection,
    apiIdentifier,
    apiIdentifier,
    false,
    {
                    "password": {
          value: newVariables.password,
          required: true,
          type: "String",
        },
              "code": {
          value: newVariables.code,
          required: true,
          type: "String",
        },
          },
    options,
    null,
    true
  ));
}

  
    
  /**
   * The fully-qualified, expanded form of the inputs for executing this action.
   * The flattened style should be preferred over this style, but for models with ambiguous API identifiers, this style can be used to remove any ambiguity.
   **/
  export type FullyQualifiedChangePasswordUserVariables = {
          currentPassword: (Scalars['String'] | null) | null,
          newPassword: (Scalars['String'] | null) | null,
      }

  /**
   * The inputs for executing changePassword on user.
   * This is the flattened style of inputs, suitable for general use, and should be preferred.
   **/

    export type ChangePasswordUserVariables = FullyQualifiedChangePasswordUserVariables;



/**
 * The return value from executing changePassword on user.
 * "Is a GadgetRecord of the model's type."
 **/
export type ChangePasswordUserResult<Options extends ChangePasswordUserOptions> =
  SelectedUserOrDefault<Options> extends void ? void : GadgetRecord<SelectedUserOrDefault<Options>>
;


/**
  * Executes the changePassword action on one record specified by `id`. Accepts the parameters for the action via the `variables` argument. Runs the action and returns a Promise for the updated record.
  */

// Flat style overload
async function changePasswordUser<Options extends ChangePasswordUserOptions>(
  id: string,
    variables: ChangePasswordUserVariables,

  options?: LimitToKnownKeys<Options, ChangePasswordUserOptions>
): Promise<ChangePasswordUserResult<Options>>;

// Fully qualified, nested api identifier overload
async function changePasswordUser<Options extends ChangePasswordUserOptions>(
  id: string,
      variables: FullyQualifiedChangePasswordUserVariables,
  
  options?: LimitToKnownKeys<Options, ChangePasswordUserOptions>
): Promise<ChangePasswordUserResult<Options>>;

// Function implementation
async function changePasswordUser<Options extends ChangePasswordUserOptions>(
  this: UserManager,
  id: string,
      variables: ChangePasswordUserVariables | FullyQualifiedChangePasswordUserVariables,
  
  options?: LimitToKnownKeys<Options, ChangePasswordUserOptions>
): Promise<ChangePasswordUserResult<Options>> {
    const newVariables = disambiguateActionParams(
      this["changePassword"],
       id,
      variables
    );

  return (await actionRunner<SelectedUserOrDefault<Options>>(
    this,
    "changePasswordUser",
    DefaultUserSelection,
    apiIdentifier,
    apiIdentifier,
    false,
    {
              id: {
          value: id,
          required: true,
          type: "GadgetID",
        },
                    "currentPassword": {
          value: newVariables.currentPassword,
          required: true,
          type: "String",
        },
              "newPassword": {
          value: newVariables.newPassword,
          required: true,
          type: "String",
        },
          },
    options,
    null,
    false
  ));
}

  



/** All the actions available at the collection level and record level for "user" */
export class UserManager {
  constructor(readonly connection: GadgetConnection) {}

  
    /**
 * Finds one user by ID. Returns a Promise that resolves to the record if found and rejects the promise if the record isn't found.
 **/
findOne: {
  <Options extends FindOneUserOptions>(id: string, options?: LimitToKnownKeys<Options, FindOneUserOptions>):
    Promise<
      GadgetRecord<
        SelectedUserOrDefault<Options>
      >
    >;
  type: "findOne",
  findByVariableName: "id";
  operationName: "user";
  modelApiIdentifier: "user";
  defaultSelection: typeof DefaultUserSelection;
  selectionType: AvailableUserSelection;
  optionsType: FindOneUserOptions;
  schemaType: Query["user"];
} = Object.assign(
  async <Options extends FindOneUserOptions>(id: string, options?: LimitToKnownKeys<Options, FindOneUserOptions>) => {
    return await findOneRunner<SelectedUserOrDefault<Options>>(
      this,
      "user",
      id,
      DefaultUserSelection,
      apiIdentifier,
      options
    );
  },
  {
    type: "findOne",
    findByVariableName: "id",
    operationName: "user",
    modelApiIdentifier: apiIdentifier,
    defaultSelection: DefaultUserSelection,
  } as any
)

  
    /**
 * Finds one user by ID. Returns a Promise that resolves to the record if found and rejects the promise if the record isn't found.
 **/
maybeFindOne: {
  <Options extends MaybeFindOneUserOptions>(id: string, options?: LimitToKnownKeys<Options, MaybeFindOneUserOptions>):
    Promise<
      GadgetRecord<
        SelectedUserOrDefault<Options>
      > | null
    >;
  type: "maybeFindOne";
  findByVariableName: "id";
  operationName: "user";
  modelApiIdentifier: "user";
  defaultSelection: typeof DefaultUserSelection;
  selectionType: AvailableUserSelection;
  optionsType: MaybeFindOneUserOptions;
  schemaType: Query["user"];
} = Object.assign(
  async <Options extends MaybeFindOneUserOptions>(id: string, options?: LimitToKnownKeys<Options, MaybeFindOneUserOptions>) => {
    const record = await findOneRunner<SelectedUserOrDefault<Options>>(
      this,
      "user",
      id,
      DefaultUserSelection,
      apiIdentifier,
      options,
      false
    );
    return record.isEmpty() ? null : record;
  },
  {
    type: "maybeFindOne",
    findByVariableName: "id",
    operationName: "user",
    modelApiIdentifier: "user",
    defaultSelection: DefaultUserSelection,
  } as any
)

  
    /**
 * Finds many user. Returns a `Promise` for a `GadgetRecordList` of objects according to the passed `options`. Optionally filters the returned records using `filter` option, sorts records using the `sort` option, searches using the `search` options, and paginates using the `last`/`before` and `first`/`after` pagination options.
 **/
findMany: {
  <Options extends FindManyUsersOptions>(options?: LimitToKnownKeys<Options, FindManyUsersOptions>):
    Promise<
      GadgetRecordList<
        SelectedUserOrDefault<Options>
      >
    >;
  type: "findMany";
  operationName: "users";
  modelApiIdentifier: "user";
  defaultSelection: typeof DefaultUserSelection;
  selectionType: AvailableUserSelection;
  optionsType: FindManyUsersOptions;
  schemaType: Query["user"];
} = Object.assign(
  async <Options extends FindManyUsersOptions>(options?: LimitToKnownKeys<Options, FindManyUsersOptions>):
    Promise<
      GadgetRecordList<
        SelectedUserOrDefault<Options>
      >
    > =>
  {
    return await findManyRunner<SelectedUserOrDefault<Options>>(
      this,
      "users",
      DefaultUserSelection,
      "user",
      options
    );
  },
  {
    type: "findMany",
    operationName: "users",
    modelApiIdentifier: apiIdentifier,
    defaultSelection: DefaultUserSelection,
  } as any
);

  
    /**
 * Finds the first matching user. Returns a `Promise` that resolves to a record if found and rejects the promise if a record isn't found, according to the passed `options`. Optionally filters the searched records using `filter` option, sorts records using the `sort` option, searches using the `search` options, and paginates using the `last`/`before` and `first`/`after` pagination options.
 **/
findFirst: {
  <Options extends FindFirstUserOptions>(options?: LimitToKnownKeys<Options, FindFirstUserOptions>):
    Promise<
      GadgetRecord<
        SelectedUserOrDefault<Options>
      >
    >;
  type: "findFirst";
  operationName: "users";
  modelApiIdentifier: "user";
  defaultSelection: typeof DefaultUserSelection;
  selectionType: AvailableUserSelection;
  optionsType: FindFirstUserOptions;
  schemaType: Query["user"];
} = Object.assign(
  async <Options extends FindFirstUserOptions>(options?: LimitToKnownKeys<Options, FindFirstUserOptions>):
    Promise<
      GadgetRecord<
        SelectedUserOrDefault<Options>
      >
    > =>
  {
    const list = await findManyRunner<SelectedUserOrDefault<Options>>(
      this,
      "users",
      DefaultUserSelection,
      apiIdentifier,
      { ...options, first: 1, last: undefined, before: undefined, after: undefined },
      true
    );
    return list[0];
  },
  {
    type: "findFirst",
    operationName: "users",
    modelApiIdentifier: apiIdentifier,
    defaultSelection: DefaultUserSelection,
  } as any
);

  
    /**
 * Finds the first matching user. Returns a `Promise` that resolves to a record if found, or null if a record isn't found, according to the passed `options`. Optionally filters the searched records using `filter` option, sorts records using the `sort` option, searches using the `search` options, and paginates using the `last`/`before` pagination options.
 **/
maybeFindFirst: {
  <Options extends MaybeFindFirstUserOptions>(options?: LimitToKnownKeys<Options, MaybeFindFirstUserOptions>):
    Promise<
      GadgetRecord<
        SelectedUserOrDefault<Options>
      > | null
    >;
  type: "maybeFindFirst";
  operationName: "users";
  modelApiIdentifier: "user";
  defaultSelection: typeof DefaultUserSelection;
  selectionType: AvailableUserSelection;
  optionsType: MaybeFindFirstUserOptions;
  schemaType: Query["user"];
} = Object.assign(
  async <Options extends MaybeFindFirstUserOptions>(options?: LimitToKnownKeys<Options, MaybeFindFirstUserOptions>):
    Promise<
      GadgetRecord<
        SelectedUserOrDefault<Options>
      > | null
    > =>
  {
    const list = await findManyRunner<SelectedUserOrDefault<Options>>(
      this,
      "users",
      DefaultUserSelection,
      apiIdentifier,
      { ...options, first: 1, last: undefined, before: undefined, after: undefined },
      false
    );
    return list?.[0] ?? null;
  },
  {
    type: "maybeFindFirst",
    operationName: "users",
    modelApiIdentifier: apiIdentifier,
    defaultSelection: DefaultUserSelection,
  } as any
);

  
    /**
  * Finds one user by its id. Returns a Promise that resolves to the record if found and rejects the promise if the record isn't found.
  **/
findById: {
  <Options extends FindOneUserOptions>(value: string, options?: LimitToKnownKeys<Options, FindOneUserOptions>):
    Promise<
      GadgetRecord<
        SelectedUserOrDefault<Options>
      >
    >;
  type: "findOne";
  findByVariableName: "id";
  operationName: "users";
  modelApiIdentifier: "user";
  defaultSelection: typeof DefaultUserSelection;
  selectionType: AvailableUserSelection;
  optionsType: FindOneUserOptions;
  schemaType: Query["user"];
} = Object.assign(
  async <Options extends FindOneUserOptions>(value: string, options?: LimitToKnownKeys<Options, FindOneUserOptions>):
    Promise<
      GadgetRecordImplementation<
        SelectedUserOrDefault<Options>
      > & SelectedUserOrDefault<Options>
    > =>
  {
    return await findOneByFieldRunner<SelectedUserOrDefault<Options>>(
      this,
      "users",
      "id",
      value,
      DefaultUserSelection,
      apiIdentifier,
      options
    );
  },
  {
    type: "findOne",
    findByVariableName: "id",
    operationName: "users",
    modelApiIdentifier: apiIdentifier,
    defaultSelection: DefaultUserSelection,
  } as any
)

  
    /**
  * Finds one user by its email. Returns a Promise that resolves to the record if found and rejects the promise if the record isn't found.
  **/
findByEmail: {
  <Options extends FindOneUserOptions>(value: string, options?: LimitToKnownKeys<Options, FindOneUserOptions>):
    Promise<
      GadgetRecord<
        SelectedUserOrDefault<Options>
      >
    >;
  type: "findOne";
  findByVariableName: "email";
  operationName: "users";
  modelApiIdentifier: "user";
  defaultSelection: typeof DefaultUserSelection;
  selectionType: AvailableUserSelection;
  optionsType: FindOneUserOptions;
  schemaType: Query["user"];
} = Object.assign(
  async <Options extends FindOneUserOptions>(value: string, options?: LimitToKnownKeys<Options, FindOneUserOptions>):
    Promise<
      GadgetRecordImplementation<
        SelectedUserOrDefault<Options>
      > & SelectedUserOrDefault<Options>
    > =>
  {
    return await findOneByFieldRunner<SelectedUserOrDefault<Options>>(
      this,
      "users",
      "email",
      value,
      DefaultUserSelection,
      apiIdentifier,
      options
    );
  },
  {
    type: "findOne",
    findByVariableName: "email",
    operationName: "users",
    modelApiIdentifier: apiIdentifier,
    defaultSelection: DefaultUserSelection,
  } as any
)

  
    signUp = Object.assign(signUpUser,
  {
    type: "action",
    operationName: "signUpUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: DefaultUserSelection,
    variables: {
      "email": {
        required: true,
        type: "String",
      },
      "password": {
        required: true,
        type: "String",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true,
    paramOnlyVariables: [],
    hasReturnType: true,
    acceptsModelInput: false,
  } as unknown as {
    type: "action";
    operationName: "signUpUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SignUpUserOptions;
    schemaType:  Query["user"];

    variablesType: (

      (
        FullyQualifiedSignUpUserVariables          | SignUpUserVariables      )
    ) | undefined;
    variables: {
                    "email": {
          required: true;
          type: "String";
        };
              "password": {
          required: true;
          type: "String";
        };
          };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true;
    paramOnlyVariables: [];
    hasReturnType: true;
    acceptsModelInput: false;
  }
)

  
      /**
  * Executes the bulkSignUp action with the given inputs.
  */
  bulkSignUp: {
    <Options extends SignUpUserOptions>(
        inputs: (FullyQualifiedSignUpUserVariables | SignUpUserVariables)[],
      options?: LimitToKnownKeys<Options, SignUpUserOptions>
    ): Promise<SignUpUserResult<Options>[]>;
    type: "action";
    operationName: "bulkSignUpUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SignUpUserOptions;
    schemaType: Query["user"];
    variablesType: (FullyQualifiedSignUpUserVariables | SignUpUserVariables)[];
    variables: {
        inputs: {
          required: true;
          type: "[BulkSignUpUsersInput!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends SignUpUserOptions>(
        inputs: (FullyQualifiedSignUpUserVariables | SignUpUserVariables)[],
      options?: LimitToKnownKeys<Options, SignUpUserOptions>
    ) => {
        const fullyQualifiedInputs = inputs.map(input =>
          disambiguateActionParams(
            this["signUp"],
            undefined,
            input
          )
        );
      
      return (await actionRunner<any>(
        this,
        "bulkSignUpUsers",
        DefaultUserSelection,
        "user",
        "users",
        true,
          {
            inputs: {
              value: fullyQualifiedInputs,
              ...this["bulkSignUp"].variables["inputs"]
            }
          }
,
        options,
        null,
        true
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkSignUpUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: DefaultUserSelection,
      variables: {
        inputs: {
          required: true,
          type: "[BulkSignUpUsersInput!]",
        },
      },
      hasReturnType: true,
      acceptsModelInput: false,
    } as any
  );

  
    signIn = Object.assign(signInUser,
  {
    type: "action",
    operationName: "signInUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: DefaultUserSelection,
    variables: {
      "email": {
        required: true,
        type: "String",
      },
      "password": {
        required: true,
        type: "String",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true,
    paramOnlyVariables: [],
    hasReturnType: false,
    acceptsModelInput: false,
  } as unknown as {
    type: "action";
    operationName: "signInUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SignInUserOptions;
    schemaType:  Query["user"];

    variablesType: (

      (
        FullyQualifiedSignInUserVariables          | SignInUserVariables      )
    ) | undefined;
    variables: {
                    "email": {
          required: true;
          type: "String";
        };
              "password": {
          required: true;
          type: "String";
        };
          };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true;
    paramOnlyVariables: [];
    hasReturnType: false;
    acceptsModelInput: false;
  }
)

  
      /**
  * Executes the bulkSignIn action with the given inputs.
  */
  bulkSignIn: {
    <Options extends SignInUserOptions>(
        inputs: (FullyQualifiedSignInUserVariables | SignInUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, SignInUserOptions>
    ): Promise<SignInUserResult<Options>[]>;
    type: "action";
    operationName: "bulkSignInUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SignInUserOptions;
    schemaType: Query["user"];
    variablesType: (FullyQualifiedSignInUserVariables | SignInUserVariables & { id: string })[];
    variables: {
        inputs: {
          required: true;
          type: "[BulkSignInUsersInput!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends SignInUserOptions>(
        inputs: (FullyQualifiedSignInUserVariables | SignInUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, SignInUserOptions>
    ) => {
        const fullyQualifiedInputs = inputs.map(input =>
          disambiguateActionParams(
            this["signIn"],
            undefined,
            input
          )
        );
      
      return (await actionRunner<any>(
        this,
        "bulkSignInUsers",
        DefaultUserSelection,
        "user",
        "users",
        true,
          {
            inputs: {
              value: fullyQualifiedInputs,
              ...this["bulkSignIn"].variables["inputs"]
            }
          }
,
        options,
        null,
        false
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkSignInUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: DefaultUserSelection,
      variables: {
        inputs: {
          required: true,
          type: "[BulkSignInUsersInput!]",
        },
      },
      hasReturnType: false,
      acceptsModelInput: false,
    } as any
  );

  
    signOut = Object.assign(signOutUser,
  {
    type: "action",
    operationName: "signOutUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: DefaultUserSelection,
    variables: {
      id: {
        required: true,
        type: "GadgetID",
      },
      "user": {
        required: false,
        type: "SignOutUserInput",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true,
    paramOnlyVariables: [],
    hasReturnType: false,
    acceptsModelInput: true,
  } as unknown as {
    type: "action";
    operationName: "signOutUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SignOutUserOptions;
    schemaType:  Query["user"];

    variablesType: (
        { id: string } &

      (
        FullyQualifiedSignOutUserVariables          | SignOutUserVariables      )
    ) | undefined;
    variables: {
              id: {
          required: true;
          type: "GadgetID";
        };
                    "user": {
          required: false;
          type: "SignOutUserInput";
        };
          };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true;
    paramOnlyVariables: [];
    hasReturnType: false;
    acceptsModelInput: true;
  }
)

  
      /**
  * Executes the bulkSignOut action with the given inputs.
  */
  bulkSignOut: {
    <Options extends SignOutUserOptions>(
        inputs: (FullyQualifiedSignOutUserVariables | SignOutUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, SignOutUserOptions>
    ): Promise<SignOutUserResult<Options>[]>;
    type: "action";
    operationName: "bulkSignOutUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SignOutUserOptions;
    schemaType: Query["user"];
    variablesType: (FullyQualifiedSignOutUserVariables | SignOutUserVariables & { id: string })[];
    variables: {
        inputs: {
          required: true;
          type: "[BulkSignOutUsersInput!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends SignOutUserOptions>(
        inputs: (FullyQualifiedSignOutUserVariables | SignOutUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, SignOutUserOptions>
    ) => {
        const fullyQualifiedInputs = inputs.map(input =>
          disambiguateActionParams(
            this["signOut"],
            undefined,
            input
          )
        );
      
      return (await actionRunner<any>(
        this,
        "bulkSignOutUsers",
        DefaultUserSelection,
        "user",
        "users",
        true,
          {
            inputs: {
              value: fullyQualifiedInputs,
              ...this["bulkSignOut"].variables["inputs"]
            }
          }
,
        options,
        null,
        false
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkSignOutUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: DefaultUserSelection,
      variables: {
        inputs: {
          required: true,
          type: "[BulkSignOutUsersInput!]",
        },
      },
      hasReturnType: false,
      acceptsModelInput: true,
    } as any
  );

  
    update = Object.assign(updateUser,
  {
    type: "action",
    operationName: "updateUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: DefaultUserSelection,
    variables: {
      id: {
        required: true,
        type: "GadgetID",
      },
      "user": {
        required: false,
        type: "UpdateUserInput",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true,
    paramOnlyVariables: [],
    hasReturnType: false,
    acceptsModelInput: true,
  } as unknown as {
    type: "action";
    operationName: "updateUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: UpdateUserOptions;
    schemaType:  Query["user"];

    variablesType: (
        { id: string } &

      (
        FullyQualifiedUpdateUserVariables          | UpdateUserVariables      )
    ) | undefined;
    variables: {
              id: {
          required: true;
          type: "GadgetID";
        };
                    "user": {
          required: false;
          type: "UpdateUserInput";
        };
          };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true;
    paramOnlyVariables: [];
    hasReturnType: false;
    acceptsModelInput: true;
  }
)

  
      /**
  * Executes the bulkUpdate action with the given inputs.
  */
  bulkUpdate: {
    <Options extends UpdateUserOptions>(
        inputs: (FullyQualifiedUpdateUserVariables | UpdateUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, UpdateUserOptions>
    ): Promise<UpdateUserResult<Options>[]>;
    type: "action";
    operationName: "bulkUpdateUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: UpdateUserOptions;
    schemaType: Query["user"];
    variablesType: (FullyQualifiedUpdateUserVariables | UpdateUserVariables & { id: string })[];
    variables: {
        inputs: {
          required: true;
          type: "[BulkUpdateUsersInput!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends UpdateUserOptions>(
        inputs: (FullyQualifiedUpdateUserVariables | UpdateUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, UpdateUserOptions>
    ) => {
        const fullyQualifiedInputs = inputs.map(input =>
          disambiguateActionParams(
            this["update"],
            undefined,
            input
          )
        );
      
      return (await actionRunner<any>(
        this,
        "bulkUpdateUsers",
        DefaultUserSelection,
        "user",
        "users",
        true,
          {
            inputs: {
              value: fullyQualifiedInputs,
              ...this["bulkUpdate"].variables["inputs"]
            }
          }
,
        options,
        null,
        false
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkUpdateUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: DefaultUserSelection,
      variables: {
        inputs: {
          required: true,
          type: "[BulkUpdateUsersInput!]",
        },
      },
      hasReturnType: false,
      acceptsModelInput: true,
    } as any
  );

  
    delete = Object.assign(deleteUser,
  {
    type: "action",
    operationName: "deleteUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: null,
    variables: {
      id: {
        required: true,
        type: "GadgetID",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false,
    paramOnlyVariables: [],
    hasReturnType: false,
    acceptsModelInput: false,
  } as unknown as {
    type: "action";
    operationName: "deleteUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: null;
    selectionType: Record<string, never>;
    optionsType: DeleteUserOptions;
    schemaType:  null ;

    variablesType: (
        { id: string } &

        {}
    ) | undefined;
    variables: {
              id: {
          required: true;
          type: "GadgetID";
        };
                };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false;
    paramOnlyVariables: [];
    hasReturnType: false;
    acceptsModelInput: false;
  }
)

  
      /**
  * Executes the bulkDelete action with the given inputs. Deletes the records on the server.
  */
  bulkDelete: {
    <Options extends DeleteUserOptions>(
        ids: string[],
      options?: LimitToKnownKeys<Options, DeleteUserOptions>
    ): Promise<DeleteUserResult<Options>[]>;
    type: "action";
    operationName: "bulkDeleteUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: null;
    selectionType: Record<string, never>;
    optionsType: DeleteUserOptions;
    schemaType: null;
    variablesType: IDsList | undefined;
    variables: {
        ids: {
          required: true;
          type: "[GadgetID!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends DeleteUserOptions>(
        ids: string[],
      options?: LimitToKnownKeys<Options, DeleteUserOptions>
    ) => {

      return (await actionRunner<any>(
        this,
        "bulkDeleteUsers",
        null,
        "user",
        "users",
        true,
          {
            ids: {
              value: ids,
              ...this["bulkDelete"].variables["ids"]
            }
          }
,
        options,
        null,
        false
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkDeleteUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: null,
      variables: {
        ids: {
          required: true,
          type: "[GadgetID!]",
        },
      },
      hasReturnType: false,
      acceptsModelInput: false,
    } as any
  );

  
    sendVerifyEmail = Object.assign(sendVerifyEmailUser,
  {
    type: "action",
    operationName: "sendVerifyEmailUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: DefaultUserSelection,
    variables: {
      "email": {
        required: true,
        type: "String",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false,
    paramOnlyVariables: [],
    hasReturnType: true,
    acceptsModelInput: false,
  } as unknown as {
    type: "action";
    operationName: "sendVerifyEmailUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SendVerifyEmailUserOptions;
    schemaType:  Query["user"];

    variablesType: (

      (
        FullyQualifiedSendVerifyEmailUserVariables          | SendVerifyEmailUserVariables      )
    ) | undefined;
    variables: {
                    "email": {
          required: true;
          type: "String";
        };
          };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false;
    paramOnlyVariables: [];
    hasReturnType: true;
    acceptsModelInput: false;
  }
)

  
      /**
  * Executes the bulkSendVerifyEmail action with the given inputs.
  */
  bulkSendVerifyEmail: {
    <Options extends SendVerifyEmailUserOptions>(
        inputs: (FullyQualifiedSendVerifyEmailUserVariables | SendVerifyEmailUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, SendVerifyEmailUserOptions>
    ): Promise<SendVerifyEmailUserResult<Options>[]>;
    type: "action";
    operationName: "bulkSendVerifyEmailUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SendVerifyEmailUserOptions;
    schemaType: Query["user"];
    variablesType: (FullyQualifiedSendVerifyEmailUserVariables | SendVerifyEmailUserVariables & { id: string })[];
    variables: {
        inputs: {
          required: true;
          type: "[BulkSendVerifyEmailUsersInput!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends SendVerifyEmailUserOptions>(
        inputs: (FullyQualifiedSendVerifyEmailUserVariables | SendVerifyEmailUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, SendVerifyEmailUserOptions>
    ) => {
        const fullyQualifiedInputs = inputs.map(input =>
          disambiguateActionParams(
            this["sendVerifyEmail"],
            undefined,
            input
          )
        );
      
      return (await actionRunner<any>(
        this,
        "bulkSendVerifyEmailUsers",
        DefaultUserSelection,
        "user",
        "users",
        true,
          {
            inputs: {
              value: fullyQualifiedInputs,
              ...this["bulkSendVerifyEmail"].variables["inputs"]
            }
          }
,
        options,
        null,
        true
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkSendVerifyEmailUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: DefaultUserSelection,
      variables: {
        inputs: {
          required: true,
          type: "[BulkSendVerifyEmailUsersInput!]",
        },
      },
      hasReturnType: true,
      acceptsModelInput: false,
    } as any
  );

  
    verifyEmail = Object.assign(verifyEmailUser,
  {
    type: "action",
    operationName: "verifyEmailUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: DefaultUserSelection,
    variables: {
      "code": {
        required: true,
        type: "String",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false,
    paramOnlyVariables: [],
    hasReturnType: true,
    acceptsModelInput: false,
  } as unknown as {
    type: "action";
    operationName: "verifyEmailUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: VerifyEmailUserOptions;
    schemaType:  Query["user"];

    variablesType: (

      (
        FullyQualifiedVerifyEmailUserVariables          | VerifyEmailUserVariables      )
    ) | undefined;
    variables: {
                    "code": {
          required: true;
          type: "String";
        };
          };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false;
    paramOnlyVariables: [];
    hasReturnType: true;
    acceptsModelInput: false;
  }
)

  
      /**
  * Executes the bulkVerifyEmail action with the given inputs.
  */
  bulkVerifyEmail: {
    <Options extends VerifyEmailUserOptions>(
        inputs: (FullyQualifiedVerifyEmailUserVariables | VerifyEmailUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, VerifyEmailUserOptions>
    ): Promise<VerifyEmailUserResult<Options>[]>;
    type: "action";
    operationName: "bulkVerifyEmailUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: VerifyEmailUserOptions;
    schemaType: Query["user"];
    variablesType: (FullyQualifiedVerifyEmailUserVariables | VerifyEmailUserVariables & { id: string })[];
    variables: {
        inputs: {
          required: true;
          type: "[BulkVerifyEmailUsersInput!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends VerifyEmailUserOptions>(
        inputs: (FullyQualifiedVerifyEmailUserVariables | VerifyEmailUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, VerifyEmailUserOptions>
    ) => {
        const fullyQualifiedInputs = inputs.map(input =>
          disambiguateActionParams(
            this["verifyEmail"],
            undefined,
            input
          )
        );
      
      return (await actionRunner<any>(
        this,
        "bulkVerifyEmailUsers",
        DefaultUserSelection,
        "user",
        "users",
        true,
          {
            inputs: {
              value: fullyQualifiedInputs,
              ...this["bulkVerifyEmail"].variables["inputs"]
            }
          }
,
        options,
        null,
        true
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkVerifyEmailUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: DefaultUserSelection,
      variables: {
        inputs: {
          required: true,
          type: "[BulkVerifyEmailUsersInput!]",
        },
      },
      hasReturnType: true,
      acceptsModelInput: false,
    } as any
  );

  
    sendResetPassword = Object.assign(sendResetPasswordUser,
  {
    type: "action",
    operationName: "sendResetPasswordUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: DefaultUserSelection,
    variables: {
      "email": {
        required: true,
        type: "String",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false,
    paramOnlyVariables: [],
    hasReturnType: true,
    acceptsModelInput: false,
  } as unknown as {
    type: "action";
    operationName: "sendResetPasswordUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SendResetPasswordUserOptions;
    schemaType:  Query["user"];

    variablesType: (

      (
        FullyQualifiedSendResetPasswordUserVariables          | SendResetPasswordUserVariables      )
    ) | undefined;
    variables: {
                    "email": {
          required: true;
          type: "String";
        };
          };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false;
    paramOnlyVariables: [];
    hasReturnType: true;
    acceptsModelInput: false;
  }
)

  
      /**
  * Executes the bulkSendResetPassword action with the given inputs.
  */
  bulkSendResetPassword: {
    <Options extends SendResetPasswordUserOptions>(
        inputs: (FullyQualifiedSendResetPasswordUserVariables | SendResetPasswordUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, SendResetPasswordUserOptions>
    ): Promise<SendResetPasswordUserResult<Options>[]>;
    type: "action";
    operationName: "bulkSendResetPasswordUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: SendResetPasswordUserOptions;
    schemaType: Query["user"];
    variablesType: (FullyQualifiedSendResetPasswordUserVariables | SendResetPasswordUserVariables & { id: string })[];
    variables: {
        inputs: {
          required: true;
          type: "[BulkSendResetPasswordUsersInput!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends SendResetPasswordUserOptions>(
        inputs: (FullyQualifiedSendResetPasswordUserVariables | SendResetPasswordUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, SendResetPasswordUserOptions>
    ) => {
        const fullyQualifiedInputs = inputs.map(input =>
          disambiguateActionParams(
            this["sendResetPassword"],
            undefined,
            input
          )
        );
      
      return (await actionRunner<any>(
        this,
        "bulkSendResetPasswordUsers",
        DefaultUserSelection,
        "user",
        "users",
        true,
          {
            inputs: {
              value: fullyQualifiedInputs,
              ...this["bulkSendResetPassword"].variables["inputs"]
            }
          }
,
        options,
        null,
        true
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkSendResetPasswordUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: DefaultUserSelection,
      variables: {
        inputs: {
          required: true,
          type: "[BulkSendResetPasswordUsersInput!]",
        },
      },
      hasReturnType: true,
      acceptsModelInput: false,
    } as any
  );

  
    resetPassword = Object.assign(resetPasswordUser,
  {
    type: "action",
    operationName: "resetPasswordUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: DefaultUserSelection,
    variables: {
      "password": {
        required: true,
        type: "String",
      },
      "code": {
        required: true,
        type: "String",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false,
    paramOnlyVariables: [],
    hasReturnType: true,
    acceptsModelInput: false,
  } as unknown as {
    type: "action";
    operationName: "resetPasswordUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: ResetPasswordUserOptions;
    schemaType:  Query["user"];

    variablesType: (

      (
        FullyQualifiedResetPasswordUserVariables          | ResetPasswordUserVariables      )
    ) | undefined;
    variables: {
                    "password": {
          required: true;
          type: "String";
        };
              "code": {
          required: true;
          type: "String";
        };
          };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: false;
    paramOnlyVariables: [];
    hasReturnType: true;
    acceptsModelInput: false;
  }
)

  
      /**
  * Executes the bulkResetPassword action with the given inputs.
  */
  bulkResetPassword: {
    <Options extends ResetPasswordUserOptions>(
        inputs: (FullyQualifiedResetPasswordUserVariables | ResetPasswordUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, ResetPasswordUserOptions>
    ): Promise<ResetPasswordUserResult<Options>[]>;
    type: "action";
    operationName: "bulkResetPasswordUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: ResetPasswordUserOptions;
    schemaType: Query["user"];
    variablesType: (FullyQualifiedResetPasswordUserVariables | ResetPasswordUserVariables & { id: string })[];
    variables: {
        inputs: {
          required: true;
          type: "[BulkResetPasswordUsersInput!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends ResetPasswordUserOptions>(
        inputs: (FullyQualifiedResetPasswordUserVariables | ResetPasswordUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, ResetPasswordUserOptions>
    ) => {
        const fullyQualifiedInputs = inputs.map(input =>
          disambiguateActionParams(
            this["resetPassword"],
            undefined,
            input
          )
        );
      
      return (await actionRunner<any>(
        this,
        "bulkResetPasswordUsers",
        DefaultUserSelection,
        "user",
        "users",
        true,
          {
            inputs: {
              value: fullyQualifiedInputs,
              ...this["bulkResetPassword"].variables["inputs"]
            }
          }
,
        options,
        null,
        true
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkResetPasswordUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: DefaultUserSelection,
      variables: {
        inputs: {
          required: true,
          type: "[BulkResetPasswordUsersInput!]",
        },
      },
      hasReturnType: true,
      acceptsModelInput: false,
    } as any
  );

  
    changePassword = Object.assign(changePasswordUser,
  {
    type: "action",
    operationName: "changePasswordUser",
    namespace: null,
    modelApiIdentifier: apiIdentifier,
    modelSelectionField: apiIdentifier,
    isBulk: false,
    defaultSelection: DefaultUserSelection,
    variables: {
      id: {
        required: true,
        type: "GadgetID",
      },
      "currentPassword": {
        required: true,
        type: "String",
      },
      "newPassword": {
        required: true,
        type: "String",
      },
    },
    hasAmbiguousIdentifier: false,
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true,
    paramOnlyVariables: [],
    hasReturnType: false,
    acceptsModelInput: false,
  } as unknown as {
    type: "action";
    operationName: "changePasswordUser";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "user";
    isBulk: false;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: ChangePasswordUserOptions;
    schemaType:  Query["user"];

    variablesType: (
        { id: string } &

      (
        FullyQualifiedChangePasswordUserVariables          | ChangePasswordUserVariables      )
    ) | undefined;
    variables: {
              id: {
          required: true;
          type: "GadgetID";
        };
                    "currentPassword": {
          required: true;
          type: "String";
        };
              "newPassword": {
          required: true;
          type: "String";
        };
          };
    hasAmbiguousIdentifier: false;
    /** @deprecated -- effects are dead, long live AAC */
    hasCreateOrUpdateEffect: true;
    paramOnlyVariables: [];
    hasReturnType: false;
    acceptsModelInput: false;
  }
)

  
      /**
  * Executes the bulkChangePassword action with the given inputs.
  */
  bulkChangePassword: {
    <Options extends ChangePasswordUserOptions>(
        inputs: (FullyQualifiedChangePasswordUserVariables | ChangePasswordUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, ChangePasswordUserOptions>
    ): Promise<ChangePasswordUserResult<Options>[]>;
    type: "action";
    operationName: "bulkChangePasswordUsers";
    namespace: null;
    modelApiIdentifier: "user";
    modelSelectionField: "users";
    isBulk: true;
    defaultSelection: typeof DefaultUserSelection;
    selectionType: AvailableUserSelection;
    optionsType: ChangePasswordUserOptions;
    schemaType: Query["user"];
    variablesType: (FullyQualifiedChangePasswordUserVariables | ChangePasswordUserVariables & { id: string })[];
    variables: {
        inputs: {
          required: true;
          type: "[BulkChangePasswordUsersInput!]";
        };
      };
    hasReturnType: boolean;
    acceptsModelInput: boolean;
  } = Object.assign(
    async <Options extends ChangePasswordUserOptions>(
        inputs: (FullyQualifiedChangePasswordUserVariables | ChangePasswordUserVariables & { id: string })[],
      options?: LimitToKnownKeys<Options, ChangePasswordUserOptions>
    ) => {
        const fullyQualifiedInputs = inputs.map(input =>
          disambiguateActionParams(
            this["changePassword"],
            undefined,
            input
          )
        );
      
      return (await actionRunner<any>(
        this,
        "bulkChangePasswordUsers",
        DefaultUserSelection,
        "user",
        "users",
        true,
          {
            inputs: {
              value: fullyQualifiedInputs,
              ...this["bulkChangePassword"].variables["inputs"]
            }
          }
,
        options,
        null,
        false
      )) as any[];
    },
    {
      type: "action",
      operationName: "bulkChangePasswordUsers",
      namespace: null,
      modelApiIdentifier: apiIdentifier,
      modelSelectionField: "users",
      isBulk: true,
      defaultSelection: DefaultUserSelection,
      variables: {
        inputs: {
          required: true,
          type: "[BulkChangePasswordUsersInput!]",
        },
      },
      hasReturnType: false,
      acceptsModelInput: false,
    } as any
  );

  
}
