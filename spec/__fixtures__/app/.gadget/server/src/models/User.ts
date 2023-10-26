// All the generated types for the "User" model preconditions, actions, params, etc
import { AmbientContext } from "../AmbientContext";
import { ActionExecutionScope, NotYetTyped, ValidationErrors, ActionTrigger } from "../types";
import { GadgetRecord, User } from "@gadget-client-development/test";
import { Select } from "@gadgetinc/api-client-core";
export type DefaultUserServerSelection = {
  readonly __typename: true;
      readonly id: true;
      readonly createdAt: true;
      readonly updatedAt: true;
      readonly resetPasswordToken: true;
      readonly emailVerificationToken: true;
      readonly password: true;
      readonly roles: true;
      readonly email: true;
      readonly googleProfileId: true;
      readonly emailVerificationTokenExpiration: true;
      readonly lastSignedIn: true;
      readonly firstName: true;
      readonly emailVerified: true;
      readonly resetPasswordTokenExpiration: true;
      readonly lastName: true;
      readonly googleImageUrl: true;
  };

  
/** All the data passed to an effect or precondition within the `update` action on the `user` model. */
export interface UpdateUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: UpdateUserActionContext;
};


    
/** All the data passed to an effect or precondition within the `delete` action on the `user` model. */
export interface DeleteUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: DeleteUserActionContext;
};


    
/** All the data passed to an effect or precondition within the `signUp` action on the `user` model. */
export interface SignUpUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: SignUpUserActionContext;
};


    
/** All the data passed to an effect or precondition within the `signIn` action on the `user` model. */
export interface SignInUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: SignInUserActionContext;
};


    
/** All the data passed to an effect or precondition within the `signOut` action on the `user` model. */
export interface SignOutUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: SignOutUserActionContext;
};


    
/** All the data passed to an effect or precondition within the `sendVerifyEmail` action on the `user` model. */
export interface SendVerifyEmailUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: SendVerifyEmailUserActionContext;
};


    
/** All the data passed to an effect or precondition within the `sendResetPassword` action on the `user` model. */
export interface SendResetPasswordUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: SendResetPasswordUserActionContext;
};


    
/** All the data passed to an effect or precondition within the `verifyEmail` action on the `user` model. */
export interface VerifyEmailUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: VerifyEmailUserActionContext;
};


    
/** All the data passed to an effect or precondition within the `resetPassword` action on the `user` model. */
export interface ResetPasswordUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: ResetPasswordUserActionContext;
};


    
/** All the data passed to an effect or precondition within the `changePassword` action on the `user` model. */
export interface ChangePasswordUserActionContext extends AmbientContext {
  /**
  * The model of the record this action is operating on
  */
  model: NotYetTyped;
  /**
  * The `user` record this action is operating on.
  */
  record: GadgetRecord<Select<User, DefaultUserServerSelection>>;
  /**
  * An object passed between all preconditions and effects of an action execution at the `scope` property.
  * Useful for transferring data between effects.
  */
  scope: ActionExecutionScope;
  /**
  * An object describing what started this action execution.
  */
  trigger: ActionTrigger;
  /**
  * An object containing all the incoming params that have been defined for this action. Includes params added by any triggers, as well as custom params defined in the action.
  */
  params: {

};
  /**
  * The context of this action. This context does not have a defined inner context.
  */
  context: ChangePasswordUserActionContext;
};


  