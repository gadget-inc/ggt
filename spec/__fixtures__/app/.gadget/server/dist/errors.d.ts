/** Bag of data details passed to an error */
interface ErrorDetails {
    cause?: Error;
    [key: string]: any;
}
export interface PermissionDeniedDetails extends ErrorDetails {
    actor?: string | Record<string, any>;
    actorRoleKeys?: string[];
    resource?: Record<string, any>;
}
declare const PermissionDeniedError_base: {
    new (message?: string, details?: ErrorDetails | undefined): {
        code: "GGT_PERMISSION_DENIED";
        statusCode: number;
        causedByClient: boolean;
        causedByUserland: boolean;
        logged: boolean;
        exposeToClient: boolean;
        exposeToSandbox: boolean;
        /** JS classname of this error instance */
        name: string;
        /** Inner error which caused this error */
        cause?: Error | undefined;
        readonly details?: ErrorDetails | undefined;
        message: string;
        stack?: string | undefined;
    };
    code: "GGT_PERMISSION_DENIED";
};
/** Thrown when an API client tries to access data that it's roles don't grant it access to. */
export declare class PermissionDeniedError extends PermissionDeniedError_base {
    readonly details: PermissionDeniedDetails;
    actor?: string | Record<string, any>;
    actorRoleKeys?: string[];
    resource?: Record<string, any>;
    constructor(message?: string, details?: PermissionDeniedDetails);
}
declare const MisconfiguredActionError_base: {
    new (message?: string, details?: ErrorDetails | undefined): {
        code: "GGT_MISCONFIGURED_ACTION";
        statusCode: number;
        causedByClient: boolean;
        causedByUserland: boolean;
        logged: boolean;
        exposeToClient: boolean;
        exposeToSandbox: boolean;
        /** JS classname of this error instance */
        name: string;
        /** Inner error which caused this error */
        cause?: Error | undefined;
        readonly details?: ErrorDetails | undefined;
        message: string;
        stack?: string | undefined;
    };
    code: "GGT_MISCONFIGURED_ACTION";
};
/** Thrown when an action is trying to execute but can't because it's missing key configuration or some configuration value is itself invalid. This is the app developer's fault -- the action needs to be corrected in order to work. */
export declare class MisconfiguredActionError extends MisconfiguredActionError_base {
}
declare const InternalError_base: {
    new (message?: string, details?: ErrorDetails | undefined): {
        code: "GGT_INTERNAL_ERROR";
        statusCode: number;
        causedByClient: boolean;
        causedByUserland: boolean;
        logged: boolean;
        exposeToClient: boolean;
        exposeToSandbox: boolean;
        /** JS classname of this error instance */
        name: string;
        /** Inner error which caused this error */
        cause?: Error | undefined;
        readonly details?: ErrorDetails | undefined;
        message: string;
        stack?: string | undefined;
    };
    code: "GGT_INTERNAL_ERROR";
};
/**
 * Catch all error thrown when something unexpected happens within the Gadget platform that isn't directly the app developer's fault.
 * Indicates that the error is the fault of the platform, and hides the details of why in case it might leak sensitive information.
 * Try not to use this as it isn't actionable by app developers, but if something really is our fault and out of their control, it's cool.
 */
export declare class InternalError extends InternalError_base {
}
declare const InvalidActionInputError_base: {
    new (message?: string, details?: ErrorDetails | undefined): {
        code: "GGT_INVALID_ACTION_INPUT";
        statusCode: number;
        causedByClient: boolean;
        causedByUserland: boolean;
        logged: boolean;
        exposeToClient: boolean;
        exposeToSandbox: boolean;
        /** JS classname of this error instance */
        name: string;
        /** Inner error which caused this error */
        cause?: Error | undefined;
        readonly details?: ErrorDetails | undefined;
        message: string;
        stack?: string | undefined;
    };
    code: "GGT_INVALID_ACTION_INPUT";
};
export declare class InvalidActionInputError extends InvalidActionInputError_base {
}
declare const InvalidStateTransitionError_base: {
    new (message?: string, details?: ErrorDetails | undefined): {
        code: "GGT_INVALID_STATE_TRANSITION";
        statusCode: number;
        causedByClient: boolean;
        causedByUserland: boolean;
        logged: boolean;
        exposeToClient: boolean;
        exposeToSandbox: boolean;
        /** JS classname of this error instance */
        name: string;
        /** Inner error which caused this error */
        cause?: Error | undefined;
        readonly details?: ErrorDetails | undefined;
        message: string;
        stack?: string | undefined;
    };
    code: "GGT_INVALID_STATE_TRANSITION";
};
export declare class InvalidStateTransitionError extends InvalidStateTransitionError_base {
}
declare const UserNotSetOnSessionError_base: {
    new (message?: string, details?: ErrorDetails | undefined): {
        code: "GGT_USER_NOT_SET_ON_SESSION";
        statusCode: number;
        causedByClient: boolean;
        causedByUserland: boolean;
        logged: boolean;
        exposeToClient: boolean;
        exposeToSandbox: boolean;
        /** JS classname of this error instance */
        name: string;
        /** Inner error which caused this error */
        cause?: Error | undefined;
        readonly details?: ErrorDetails | undefined;
        message: string;
        stack?: string | undefined;
    };
    code: "GGT_USER_NOT_SET_ON_SESSION";
};
export declare class UserNotSetOnSessionError extends UserNotSetOnSessionError_base {
}
declare const NoSessionForAuthenticationError_base: {
    new (message?: string, details?: ErrorDetails | undefined): {
        code: "GGT_NO_SESSION_FOR_AUTHENTICATION";
        statusCode: number;
        causedByClient: boolean;
        causedByUserland: boolean;
        logged: boolean;
        exposeToClient: boolean;
        exposeToSandbox: boolean;
        /** JS classname of this error instance */
        name: string;
        /** Inner error which caused this error */
        cause?: Error | undefined;
        readonly details?: ErrorDetails | undefined;
        message: string;
        stack?: string | undefined;
    };
    code: "GGT_NO_SESSION_FOR_AUTHENTICATION";
};
export declare class NoSessionForAuthenticationError extends NoSessionForAuthenticationError_base {
}
declare const NoTransitionError_base: {
    new (message?: string, details?: ErrorDetails | undefined): {
        code: "GGT_NO_TRANSITION";
        statusCode: number;
        causedByClient: boolean;
        causedByUserland: boolean;
        logged: boolean;
        exposeToClient: boolean;
        exposeToSandbox: boolean;
        /** JS classname of this error instance */
        name: string;
        /** Inner error which caused this error */
        cause?: Error | undefined;
        readonly details?: ErrorDetails | undefined;
        message: string;
        stack?: string | undefined;
    };
    code: "GGT_NO_TRANSITION";
};
/** Represents what is thrown when an action can't be taken on a record because it's an illegal state transition */
export declare class NoTransitionError extends NoTransitionError_base {
}
declare const GlobalNotSetError_base: {
    new (message?: string, details?: ErrorDetails | undefined): {
        code: "GGT_GLOBAL_NOT_SET";
        statusCode: number;
        causedByClient: boolean;
        causedByUserland: boolean;
        logged: boolean;
        exposeToClient: boolean;
        exposeToSandbox: boolean;
        /** JS classname of this error instance */
        name: string;
        /** Inner error which caused this error */
        cause?: Error | undefined;
        readonly details?: ErrorDetails | undefined;
        message: string;
        stack?: string | undefined;
    };
    code: "GGT_GLOBAL_NOT_SET";
};
export declare class GlobalNotSetError extends GlobalNotSetError_base {
}
export {};
