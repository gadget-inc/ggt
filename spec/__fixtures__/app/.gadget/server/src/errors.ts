/**
 * Parent class for all the enhanced errors in any gadget-owned package
 */
class GadgetError extends Error {
  /** Was this error caused by the Gadget application's code */
  causedByUserland = false;
  /** Was this error caused by the API client calling the Gadget application */
  causedByClient = false;
  /** What HTTP status code should be sent when responding with this error */
  statusCode = 500;
  /** A GGT_SOMETHING human/machine readable string unique error class name */
  code!: string;
  /** If this error is thrown, should we allow its code, message, and details to be sent to the client. Defaults to true for errors with 400 series status codes and false otherwise. */
  exposeToClient!: boolean;
  /** If this error is thrown, should we allow its code, message, and details to be sent to the sandbox. Defaults to true. */
  exposeToSandbox!: boolean;
  /** Optional bag of data about this error */
  details?: Record<string, any>;
  /** Was this error already logged? */
  logged = false;
}

/** Bag of data details passed to an error */
interface ErrorDetails {
  cause?: Error;
  [key: string]: any;
}

const errorClass = <Code extends string>(
  code: Code,
  defaultMessage: string,
  options: {
    logged?: boolean;
    statusCode?: number;
    causedByClient?: boolean;
    causedByUserland?: boolean;
    exposeToClient?: boolean;
    exposeToSandbox?: boolean;
  } = {}
) => {
  const opts = {
    ...options,
    logged: options.logged ?? false,
    statusCode: options.statusCode ?? 500,
    causedByClient: options.causedByClient ?? false,
    causedByUserland: options.causedByUserland ?? false,
    exposeToClient: options.exposeToClient ?? false,
    exposeToSandbox: options.exposeToSandbox ?? false,
  };

  return class extends GadgetError {
    static code: Code = code;
    code: Code = code;
    statusCode = opts.statusCode;
    causedByClient = opts.causedByClient;
    causedByUserland = opts.causedByUserland;
    logged = opts.logged;
    exposeToClient = opts.exposeToClient ?? (opts.causedByClient || (opts.statusCode >= 400 && opts.statusCode < 500));
    exposeToSandbox = opts.exposeToSandbox ?? opts.causedByUserland;

    /** JS classname of this error instance */
    name!: string;

    /** Inner error which caused this error */
    cause?: Error;

    constructor(message: string = defaultMessage, readonly details?: ErrorDetails) {
      super(`${code}: ${message}`);
      this.details = details;
      if (details?.cause) {
        this.cause = details.cause;
        delete details.cause;
      }
      this.name = this.constructor.name;
    }
  };
};

export interface PermissionDeniedDetails extends ErrorDetails {
  actor?: string | Record<string, any>;
  actorRoleKeys?: string[];
  resource?: Record<string, any>;
}

/** Thrown when an API client tries to access data that it's roles don't grant it access to. */
export class PermissionDeniedError extends errorClass("GGT_PERMISSION_DENIED" as const, "Permission denied to access this resource.", {
  statusCode: 403,
  causedByClient: true,
  causedByUserland: false,
}) {
  actor?: string | Record<string, any>;
  actorRoleKeys?: string[];
  resource?: Record<string, any>;

  constructor(message?: string, readonly details: PermissionDeniedDetails = {}) {
    super(message, details);
    this.actor = details.actor;
    this.actorRoleKeys = details.actorRoleKeys;
    this.resource = details.resource;
  }
}

/** Thrown when an action is trying to execute but can't because it's missing key configuration or some configuration value is itself invalid. This is the app developer's fault -- the action needs to be corrected in order to work. */
export class MisconfiguredActionError extends errorClass(
  "GGT_MISCONFIGURED_ACTION" as const,
  "Invalid action configuration, request cannot be processed until this is corrected.",
  {
    statusCode: 500,
    causedByClient: false,
    causedByUserland: true,
  }
) {}

/**
 * Catch all error thrown when something unexpected happens within the Gadget platform that isn't directly the app developer's fault.
 * Indicates that the error is the fault of the platform, and hides the details of why in case it might leak sensitive information.
 * Try not to use this as it isn't actionable by app developers, but if something really is our fault and out of their control, it's cool.
 */
export class InternalError extends errorClass("GGT_INTERNAL_ERROR" as const, "An internal error occurred.", {
  statusCode: 500,
  causedByClient: false,
  causedByUserland: false,
}) {}

export class InvalidActionInputError extends errorClass("GGT_INVALID_ACTION_INPUT" as const, "Input was invalid for an action", {
  statusCode: 422,
  causedByClient: true,
  causedByUserland: false,
}) {}

export class InvalidStateTransitionError extends errorClass("GGT_INVALID_STATE_TRANSITION" as const, "Invalid state transition", {
  statusCode: 422,
  causedByClient: false,
  causedByUserland: true,
}) {}

export class UserNotSetOnSessionError extends errorClass("GGT_USER_NOT_SET_ON_SESSION" as const, "User not set on session", {
  causedByClient: true,
  causedByUserland: false,
}) {}

export class NoSessionForAuthenticationError extends errorClass(
  "GGT_NO_SESSION_FOR_AUTHENTICATION" as const,
  "There is no authenticated user in scope.",
  {
    causedByClient: true,
    causedByUserland: false,
  }
) {}
/** Represents what is thrown when an action can't be taken on a record because it's an illegal state transition */
export class NoTransitionError extends errorClass("GGT_NO_TRANSITION" as const, "Invalid action", {
  statusCode: 422,
  causedByClient: true,
  causedByUserland: false,
}) {}

export class GlobalNotSetError extends errorClass("GGT_GLOBAL_NOT_SET" as const, "Globals not yet set", {
  statusCode: 500,
  causedByClient: false,
  causedByUserland: false,
}) {}
