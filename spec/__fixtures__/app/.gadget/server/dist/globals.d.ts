import type { RequestContext } from "@fastify/request-context";
import type { FastifyLoggerInstance } from "fastify";
import type { AnyActionContext, AnyAmbientContext, AnyEffectContext, AnyGlobalActionContext } from "./types";
export declare const actionContextLocalStorage: any;
/**
 * Extend the @fastify/request-context types with Gadget's added reference to the current unit of work's context
 * See https://github.com/fastify/fastify-request-context#typescript
 * */
declare module "@fastify/request-context" {
    interface RequestContextData {
        requestContext: AnyAmbientContext | AnyActionContext | AnyGlobalActionContext | AnyEffectContext;
    }
}
export declare const Globals: {
    /**
     * Internal variable to store the model validator function, set in `set` by the `AppBridge`.
     * @internal
     */
    modelValidator: (modelKey: string) => Promise<any>;
    /**
     * Internal variable to store the request context module, set in `set` by the `AppBridge`.
     * @internal
     */
    requestContext: RequestContext;
    /**
     * @internal
     */
    logger: FastifyLoggerInstance;
    /**
     * Require function for importing code from the gadget platform context instead of the app's context.
     * @internal
     */
    platformRequire: any;
    /**
     * This is used internally to set the globals for this instance of the framework package.
     * @internal
     */
    set(globals: {
        logger: FastifyLoggerInstance;
        modelValidator: (modelKey: string) => Promise<any>;
        requestContext: RequestContext;
        platformRequire: any;
    }): void;
    /**
     * Lazy-loaded modules for use in the framework package from the gadget platform context.
     * @internal
     */
    platformModules: {
        lodash: () => any;
        bcrypt: () => any;
    };
};
