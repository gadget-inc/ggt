import type { RequestContext } from "@fastify/request-context";
import { AsyncLocalStorage } from "async_hooks";
import type { FastifyLoggerInstance } from "fastify";
import type { AnyActionContext, AnyAmbientContext, AnyEffectContext, AnyGlobalActionContext } from "./types";
export const actionContextLocalStorage = new AsyncLocalStorage<AnyActionContext | AnyGlobalActionContext | AnyEffectContext>();

/**
 * Extend the @fastify/request-context types with Gadget's added reference to the current unit of work's context
 * See https://github.com/fastify/fastify-request-context#typescript
 * */
declare module "@fastify/request-context" {
  interface RequestContextData {
    requestContext: AnyAmbientContext | AnyActionContext | AnyGlobalActionContext | AnyEffectContext;
  }
}

const platformModuleRequirer = <T = any>(name: string) => {
  let mod: T = null as any;
  return () => {
    if (!mod) {
      if (!Globals.platformRequire) throw new Error("Globals.platformRequire is not set, has it been injected by the sandbox yet?");
      mod = Globals.platformRequire(name);
    }
    return mod;
  };
};

export const Globals = {
  /**
   * Internal variable to store the model validator function, set in `set` by the `AppBridge`.
   * @internal
   */
  modelValidator: null as any as (modelKey: string) => Promise<any>,

  /**
   * Internal variable to store the request context module, set in `set` by the `AppBridge`.
   * @internal
   */
  requestContext: null as any as RequestContext,

  /**
   * @internal
   */
  logger: null as any as FastifyLoggerInstance,

  /**
   * Require function for importing code from the gadget platform context instead of the app's context.
   * @internal
   */
  platformRequire: null as any as typeof require,

  /**
   * This is used internally to set the globals for this instance of the framework package.
   * @internal
   */
  set(globals: {
    logger: FastifyLoggerInstance;
    modelValidator: (modelKey: string) => Promise<any>;
    requestContext: RequestContext;
    platformRequire: typeof require;
  }) {
    Object.assign(this, globals);
  },

  /**
   * Lazy-loaded modules for use in the framework package from the gadget platform context.
   * @internal
   */
  platformModules: {
    lodash: platformModuleRequirer("lodash"),
    bcrypt: platformModuleRequirer("bcrypt"),
  },
};
