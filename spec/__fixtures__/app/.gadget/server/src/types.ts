import type { AnyClient, GadgetRecord } from "@gadgetinc/api-client-core";
import type { FastifyLoggerInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Session } from "./Session";
import type {
  JSONTransportConfig,
  SESTransportConfig,
  SMTPTransportConfig,
  SendmailTransportConfig,
  StreamTransportConfig,
} from "./nodemailer-transports";
import type { AppTenancy, AppTenancyKey } from "./tenancy";

/**
 * An object passed between all preconditions and effects of an action execution at the `scope` property.
 * Useful for transferring data between effects.
 **/
export interface ActionExecutionScope {
  recordDeleted?: boolean;
  [key: string]: any;
}

/** Information about the current request being processed by Gadget. */
export interface RequestData {
  /** The remote IP address of the request */
  ip?: string;
  /** The user agent header of the request */
  userAgent?: string;
}

/** Describes an action triggered by running a Shopify webhook */
export interface ShopifyWebhookActionTrigger {
  type: "shopify_webhook";
  /** The topic of the incoming webhook from Shopify, like products/update or orders/create */
  topic: string;
  /** The raw incoming payload from Shopify */
  payload: Record<string, any>;
  /** The ID of the shop receiving the webhook */
  shopId: string;
  /** The number of times this webhook has been retried */
  retries: number;
}

export interface PublicAPIActionTrigger {
  /** Mutation name called in the API */
  mutationName: string;
  /** Model identifier the mutation was called on. Usually the same as the model the action is being run on, but will be different if the action is nested. Is not set for global actions. */
  rootModel?: string;
  /** Action identifier triggered by the mutation. Usually the same as the action is being run, but will be different if the current action is nested */
  rootAction: string;
  /** The params passed to this API call, including any data for nested actions if passed */
  rawParams: Record<string, any>;
}

/** Describes an action triggered by calling a mutation in the app's generated GraphQL API */
export interface APIActionTrigger extends PublicAPIActionTrigger {
  type: "api";
}

/** Describes an action triggered by running a sync on a Shopify model. */
export interface ShopifySyncActionTrigger {
  type: "shopify_sync";
  /** The shop id being synced */
  shopId: string;
  /** The API version of the shop being synced */
  apiVersion: string;
  /** The available oauth scopes of the shop being synced */
  shopifyScopes: string[];
  /** The id of the sync record tracking the state of this sync, if available */
  syncId?: string;
  /** The specified date range of this sync, if set when the sync was started */
  syncSince?: string;
  /** The list of model apiIdentifiers this sync will work on. */
  models: string[];
  /** If this sync is being run in force mode, which will always run actions, even if the updated_at timestamps match between Gadget and Shopify */
  force: boolean;
  /** The string reason why this sync was started if set when the sync began */
  startReason?: string;
}

/** Describes an action run by one event on a schedule */
export interface SchedulerActionTrigger {
  type: "scheduler";
}

/** Describes an action run by a Shopify merchant completing the OAuth process to install an application */
export interface ShopifyOAuthActionTrigger {
  type: "shopify_oauth";
}

/** Describes an action run by a Shopify Admin app being installed into Gadget */
export interface ShopifyAdminActionTrigger {
  type: "shopify_admin";
}

/** Represents actions triggered by happenings inside the Gadget platform, like maintenance, or administrative actions taken inside the Gadget editor */
export interface PlatformTrigger {
  type: "platform";
  reason: string;
}

/** Represents actions triggered by tests within the Gadget platform */
export interface MockActionTrigger {
  type: "mock";
}

export interface GoogleOAuthActionTrigger {
  user: {
    given_name: string;
    family_name: string;
    email: string;
    email_verified: string;
    name: string;
    picture: string;
    hd: string;
    locale: string;
  };
}

export interface GoogleOAuthSignInActionTrigger extends GoogleOAuthActionTrigger {
  type: "google_oauth_signin";
}
export interface GoogleOAuthSignUpActionTrigger extends GoogleOAuthActionTrigger {
  type: "google_oauth_signup";
}

export interface GadgetEmailPasswordSignUpTrigger extends PublicAPIActionTrigger {
  type: "user_sign_up";
}

export interface GadgetEmailPasswordSignInTrigger extends PublicAPIActionTrigger {
  type: "user_sign_in";
}

export interface GadgetEmailPasswordResetTrigger extends PublicAPIActionTrigger {
  type: "user_reset_password";
}

export interface GadgetEmailPasswordSendResetTrigger extends PublicAPIActionTrigger {
  type: "user_send_reset_password";
}

export interface GadgetEmailPasswordVerifyTrigger extends PublicAPIActionTrigger {
  type: "user_verify_email";
}

export interface GadgetEmailPasswordSendVerifyTrigger extends PublicAPIActionTrigger {
  type: "user_send_verify_email";
}

export interface GadgetEmailPasswordChangePasswordTrigger extends PublicAPIActionTrigger {
  type: "user_change_password";
}

export type ActionTrigger =
  | ShopifyWebhookActionTrigger
  | APIActionTrigger
  | ShopifySyncActionTrigger
  | SchedulerActionTrigger
  | ShopifyOAuthActionTrigger
  | ShopifyAdminActionTrigger
  | PlatformTrigger
  | MockActionTrigger
  | GoogleOAuthSignInActionTrigger
  | GoogleOAuthSignUpActionTrigger
  | GadgetEmailPasswordSignUpTrigger
  | GadgetEmailPasswordSignInTrigger
  | GadgetEmailPasswordResetTrigger
  | GadgetEmailPasswordSendResetTrigger
  | GadgetEmailPasswordVerifyTrigger
  | GadgetEmailPasswordSendVerifyTrigger
  | GadgetEmailPasswordChangePasswordTrigger;

export type ConfigurationVariablesBlob = Record<string, string | null>;

/** @internal */
export type FindRecordCondition = Record<string, any>;

/**
 * The base attributes most records have
 **/
export interface BaseRecord {
  __typename?: string;
  id?: string;
  state?: any;
  stateHistory?: any;
  [key: string]: any;
}

export interface AnyBulkRecordLoader {
  loadRecord(apiIdentifier: string, condition: FindRecordCondition): Promise<GadgetRecord<BaseRecord> | undefined>;
}

/** Gadget's Error tracking object used in validation code effects for adding errors when a validation fails.*/
export interface ValidationErrors {
  /**
   * Add an error to the errors list for a given field
   * @param {string} field - The `apiIdentifier` of the field you wish to add an error to
   * @param {string} message - A mesage describing the error in detail.
   */
  add(field: string, message: string): void;

  /**
   * Returns the number of errors for this record validation pass.
   */
  get size(): number;

  /**
   * Returns `true` if there are no errors, otherwise returns `false`.
   */
  get empty(): boolean;

  /**
   * Returns an array of objects containing the field's `apiIdentifier` and the error `message` string for all errors added so far.
   */
  list: { apiIdentifier: string; message: string }[];

  /**
   * Returns a simplified JSON object representing the error messages grouped by `apiIdentifier`
   */
  toJSON(): {
    [apiIdentifier: string]: string[];
  };
}

/** A generic interface for an object that doesn't have a committed a public interface. */
export interface NotYetTyped {
  [key: string]: any;
}

export interface AnyParams {
  [key: string]: string | number | boolean | object | bigint | null | undefined;
}

export interface ActionDescriptor {
  key: string;
  type: "Action" | "ModelAction";
  apiIdentifier: string;
  timeoutMilliseconds: number;
  hasReturnType: boolean;
}

export interface GlobalActionDescriptor {
  key: string;
  type: "GlobalAction";
  apiIdentifier: string;
  timeoutMilliseconds: number;
  hasReturnType: boolean;
}

export interface ModelDescriptor extends ModelMetadata {
  validator: {
    validate(context: AnyEffectContext, record: GadgetRecord<BaseRecord>): Promise<void>;
  };
}
/** Represents the data that's in always context */
export interface AnyAmbientContext {
  /** The current request's session, if it has one. Requests made by browsers are given sessions, but requests made using Gadget API Keys are not. */
  session: Session | null;
  /** The current request's session ID, if it has one. Requests made by browsers are given sessions, but requests made using Gadget API Keys are not. */
  sessionID: string | null;
  /** All <%- applicationName %> configuration values */
  config: ConfigurationVariablesBlob;
  /** A map of connection name to instantiated connection objects for <%- applicationName %> */
  connections: Record<string, unknown>;
  /** A high performance structured logger which writes logs to the Logs Viewer in the Gadget Editor. */
  logger: FastifyLoggerInstance;
  /**
   * An instance of the API client for <%- applicationName %>.
   *
   * __Note__: This client is authorized using a superuser internal api token and has permission to invoke any action in the system using normal API mutations or the Internal API.
   **/
  api: AnyClient;
  /**
   * The details of the request that is invoking this unit of work, if it was invoked by a request.
   *
   * __Note__: Request details are not always present, like during a background connection sync, a background job, or an action retry.
   **/
  request?: RequestData;
  /**
   * A unique identifer for this context
   */
  id: string;
  /**
   * A boolean describing if this unit of work will be retried automatically or not
   */
  willRetry?: boolean;
  /** App URL for the current environment e.g. https://example.gadget.app */
  currentAppUrl: string;
  /** An object for sending emails */
  emails: GadgetMailer;
  /**
   * The current tenancy for this unit of work
   * @internal
   */
  [AppTenancyKey]?: AppTenancy;
  /** @internal */
  loaders: AnyBulkRecordLoader;
  /** @internal */
  effectAPIs: any;
  /** @internal */
  authConfig?: AuthenticationConfiguration;
}

/** The context for a request passed to an HTTP route */
export interface AnyRequestContext extends AnyAmbientContext {
  gadgetContext: Record<string, any>;
  currentAppUrl: string;
  request: FastifyRequest;
  reply: FastifyReply;
  /** @deprecated */
  applicationIdentity: any | null;
  /** @deprecated */
  applicationSessionID?: string | null;
  /** @deprecated */
  applicationSession?: Session | null;
}

export interface BaseActionContext extends AnyAmbientContext {
  /** Details about what triggered this action or global action to run */
  trigger: ActionTrigger;

  /**
   * An object passed between all preconditions and effects of an action execution at the \`scope\` property.
   * Useful for transferring data between effects.
   */
  scope: ActionExecutionScope;

  /**
   * @internal
   */
  [AppTenancyKey]?: AppTenancy;
}

/**
 * An action context type for use in actions that can run on any model.
 */
export interface AnyActionContext extends BaseActionContext {
  type: "action";

  /** Details about the action being executed */
  action: ActionDescriptor;

  /**
   * The record this action is operating on.
   */
  record: GadgetRecord<BaseRecord>;

  /**
   * The model this action is for.
   */
  model: ModelDescriptor;

  /**
   * The parameters passed to the action.
   */
  params: AnyParams;

  /** The phase of execution we're running currently */
  phase: "precondition" | "run" | "success" | "failure";

  /**
   * The current context for this action
   */
  context: AnyActionContext;

  /**
   * @deprecated
   */
  transition?: {
    type: "Transition";
    key: string;
    actionKey: string;
    fromStateKey: string;
    toStateKey: string;
  };
}

/**
 * Describes the context passed to every global action.
 */
export interface AnyGlobalActionContext extends BaseActionContext {
  type: "global-action";

  /** Details about the global action being executed */
  action: GlobalActionDescriptor;

  /** What phase of execution this global action is currently in */
  phase: "precondition" | "run" | "success" | "failure";

  /**
   * The parameters passed to the action.
   */
  params: AnyParams;

  /**
   * The current context for this global action
   */
  context: AnyGlobalActionContext;
}

/**
 * Represents all the context available when executing one effect of an action or global action
 **/
export interface AnyEffectContext extends BaseActionContext {
  type: "effect";
  effect: {
    spec: { id: string };
    configuration: Record<string, any>;
  };
  /**
   * The parameters passed to this effect.
   */
  params: AnyParams;
  /**
   * The specific connection this effect has been contributed by
   **/
  connection?: unknown;
  model?: ModelDescriptor; // present for effects on actions, not present for effects on GlobalActions
  record?: GadgetRecord<BaseRecord>; // present for effects on actions, not present for effects on GlobalActions
}

/**
 * Represents all the context available when executing one precondition of an action or global action
 * @deprecated
 **/
export interface AnyPreconditionContext extends BaseActionContext {
  type: "precondition";
  condition: {
    spec: { id: string };
    configuration: Record<string, any>;
  };
  model?: ModelDescriptor; // present for effects on actions, not present for effects on GlobalActions
  record?: GadgetRecord<BaseRecord>; // present for effects on actions, not present for effects on GlobalActions
  params: AnyParams;
}

export type ActionContextForBlob<T> = T extends { type: "Action" }
  ? AnyActionContext
  : T extends { type: "GlobalAction" }
  ? AnyGlobalActionContext
  : never;

/**
 * @internal
 */
export interface FieldMetadata {
  fieldType: string;
  key: string;
  name: string;
  apiIdentifier: string;
  configuration: { [key: string]: any };
  internalWritable: boolean;
}

/**
 * @internal
 */
export interface ModelMetadata {
  key: string;
  name: string;
  apiIdentifier: string;
  fields: {
    [key: string]: FieldMetadata;
  };
  graphqlTypeName: string;
  stateChart: any;
}

/**
 * Action configuration settings
 *
 * @property actionType - Action type. Defaults to `custom`.
 * @property transactional - Whether the action when running the `run` function should be run in a transaction. Defaults to `true` for model actions, and `false` for global actions.
 * @property timeoutMS - The timeout in milliseconds for the action. Defaults to 3 minutes (180000).
 * @property returnType - Whether the action should return the result of the `run` function. Defaults to `false` for model actions and `true` for global actions.
 */
export interface ActionOptions {
  actionType?: "create" | "update" | "delete" | "custom";
  transactional?: boolean;
  timeoutMS?: number;
  returnType?: boolean;
}

/** Gadget wrapper for NodeMailer, used to facilitate the sending of emails.*/
export interface GadgetMailer {
  /** Verifies SMTP configuration */
  verifyConnection(): Promise<void>;
  /** Sets the transport configuration used for transporting emails */
  setTransport(
    transport: SMTPTransportConfig | SendmailTransportConfig | StreamTransportConfig | JSONTransportConfig | SESTransportConfig
  ): void;
  /** Sends the email using the set transporter */
  sendMail(mailData: MailData): Promise<void>;
  /** Renders an ejs template */
  render(template: string, data: any): string;
}

/**
 * @internal
 */
export interface AuthenticationConfigurationMethod {
  specID: string;
  configuration?:
    | {
        type: "GoogleMethodConfiguration";
        gadgetManagedCredentials: boolean;
        callbackPath: string;
        scopes: string[];
        redirectOnSuccessfulSignInPath?: string | null;
        credentials: {
          clientID?: string;
          clientSecret?: string;
        };
      }
    | {
        type: "AuthenticationMethodConfiguration";
        values: Record<string, any>;
      }
    | {
        type: "EmailPasswordMethodConfiguration";
      };
}

/**
 * @internal
 */
export interface AuthenticationConfiguration {
  signInPath: string;
  redirectOnForbidden: boolean;
  sessionExpirationMs: number;
  defaultAuthRoles: string[];
  redirectOnSuccessfulSignInPath?: string;
  methods?: AuthenticationConfigurationMethod[];
}

/** The options for the mail object being sent */
export type MailData = {
  to: string | string[] | Address | Array<string | Address>;
  subject?: string;
  /** The body of the email */
  html?: string;
  /** The From address displayed to users as to who the email came from. If using Gadget transport, must end in the app's approved subdomain, the value of primaryDomain found in Config. If one is not provided then a default address for the app will be used */
  from?: string | Address;
  /** The Sender header used to identify the agent responsible for the actual transmission of the email. Can only be set when using a Custom transport */
  sender?: string | Address;
};

export type Address = {
  name: string;
  address: string;
};
