import type { OperationContext, Exchange } from "@urql/core";
import { pipe, map } from "wonka";
import { GadgetConnection, AuthenticationMode, GadgetTransaction, InternalModelManager } from "@gadgetinc/api-client-core";
import type { ClientOptions as ApiClientOptions, AnyClient } from '@gadgetinc/api-client-core';
import type { DocumentNode } from 'graphql';
import type {
  Scalars,
} from "./types";
import { UserManager } from "./models/User.js";
import { SessionManager } from "./models/Session.js";
import { CurrentSessionManager } from "./models/CurrentSession.js";

type InternalModelManagers = {
  user: InternalModelManager;
  session: InternalModelManager;
};

type ClientOptions = Omit<ApiClientOptions, "environment"> & { environment?: string };
const productionEnv = "production";
const developmentEnv = "development";

/**
 * Return the implicit environment
 * We specifically use the string `process.env.NODE_ENV` so that bundlers like webpack or vite can string replace this value in built source codes with the user's desired value.
 * In browsers or other environments, `process` may be undefined, so we catch any errors and return undefined.
 */
const getImplicitEnv = () => {
  try {
    return process.env.NODE_ENV
  } catch (error) {
    return undefined;
  }
}

/**
 * Root object used for interacting with the "Test" API. `Client` has `query` and `mutation` functions for executing raw GraphQL queries and mutations, as well as `ModelManager` objects for manipulating models with a JavaScript API. Client also wraps a `connection`, which implements the transport layer if you need access to that.
 * */
export class Client implements AnyClient {
  connection: GadgetConnection;

  user: UserManager;
  session: SessionManager;
  currentSession: CurrentSessionManager;

  /**
  * Namespaced object for accessing models via the Gadget internal APIs, which provide lower level and higher privileged operations directly against the database. Useful for maintenance operations like migrations or correcting broken data, and for implementing the high level actions.
  *
  * Returns an object of model API identifiers to `InternalModelManager` objects.
  *
  * Example:
  * `api.internal.user.findOne(...)`
  */
  internal: InternalModelManagers;

  developmentApiRoot = "https://test--development.ggt.pub/";
  productionApiRoot = "https://test.ggt.pub/";
  applicationId = "15";

  constructor(options?: ClientOptions) {
    const environment = options?.environment ?? getImplicitEnv() ?? developmentEnv;
    let normalizedEnvironment = environment.toLocaleLowerCase();

    if (normalizedEnvironment != developmentEnv && normalizedEnvironment != productionEnv) {
      console.warn("Invalid environment", environment, "defaulting to development");
      normalizedEnvironment = developmentEnv;
    }

    const exchanges = {...options?.exchanges};

    if (normalizedEnvironment === developmentEnv) {
      const devHarnessExchange: Exchange = ({ forward }) => {
        return operations$ => {
          const operationResult$ = forward(operations$)

          return pipe(
            operationResult$,
            map(result => {
              if (typeof window !== "undefined" && typeof CustomEvent === "function") {
                const event = new CustomEvent("gadget:devharness:graphqlresult", { detail: result });
                window.dispatchEvent(event);
              }


              return result;
            })
          );
        };
      };

      exchanges.beforeAll = [
        devHarnessExchange,
        ...(exchanges.beforeAll ?? []),
      ];
    }

    this.connection = new GadgetConnection({
      endpoint: new URL("api/graphql", normalizedEnvironment == productionEnv ? this.productionApiRoot : this.developmentApiRoot).toString(),
      applicationId: this.applicationId,
      authenticationMode: options?.authenticationMode ?? (typeof window == 'undefined' ? { anonymous: true } : { browserSession: true }),
      ...options,
      exchanges,
      environment: normalizedEnvironment == productionEnv ? "Production" : "Development"
    });

    if (typeof window != 'undefined' && this.connection.authenticationMode == AuthenticationMode.APIKey && !(options as any)?.authenticationMode?.dangerouslyAllowBrowserApiKey) {
      console.warn("WARNING: GGT_BROWSER_API_KEY_USAGE: Using a Gadget API key to authenticate this client object is insecure and will leak your API keys to attackers. Please use a different authentication mode.")

    }

    this.user = new UserManager(this.connection);
    this.session = new SessionManager(this.connection);
    this.currentSession = new CurrentSessionManager(this.connection);

    this.internal = {
      user: new InternalModelManager("user", this.connection, {
      	pluralApiIdentifier: "users",
        // @ts-ignore
	      hasAmbiguousIdentifier: false,
      }),
      session: new InternalModelManager("session", this.connection, {
      	pluralApiIdentifier: "sessions",
        // @ts-ignore
	      hasAmbiguousIdentifier: false,
      }),
    };
  }



  /** Run an arbitrary GraphQL query. */
  async query(graphQL: string | DocumentNode, variables?: Record<string, any>, options?: Partial<OperationContext>) {
    const {data, error} = await this.connection.currentClient.query(graphQL, variables, options).toPromise();
    if (error) throw error
    return data;
  }

  /** Run an arbitrary GraphQL mutation. */
  async mutate(graphQL: string | DocumentNode, variables?: Record<string, any>) {
    const {data, error} = await this.connection.currentClient.mutation(graphQL, variables).toPromise();
    if (error) throw error
    return data;
  }

  /** Start a transaction against the Gadget backend which will atomically commit (or rollback). */
  transaction = async <T>(callback: (transaction: GadgetTransaction) => Promise<T>): Promise<T> => {
    return await this.connection.transaction(callback)
  }

  /**
   * `fetch` function that works the same as the built-in `fetch` function, but automatically passes authentication information for this API client.
   *
   * @example
   * await api.fetch("https://myapp--development.gadget.app/foo/bar");
   *
   * @example
   * // fetch a relative URL from the endpoint this API client is configured to fetch from
   * await api.fetch("/foo/bar");
   **/
  async fetch(input: RequestInfo | URL, init: RequestInit = {}) {
    return await this.connection.fetch(input, init);
  }

  /**
  * Get a new direct upload token for file uploads to directly to cloud storage.
  * See https://docs.gadget.dev/guides/storing-files#direct-uploads-using-tokens for more information
  * @return { url: string, token: string } A `url` to upload one file to, and a token for that file to pass back to Gadget as an action input.
  */
  getDirectUploadToken = async (): Promise<{url: string, token: string}> => {
    const result = await this.query(`query GetDirectUploadToken($nonce: String) { gadgetMeta { directUploadToken(nonce: $nonce) { url, token } } }`, {nonce: Math.random().toString(36).slice(2, 7)}, {
      requestPolicy: "network-only",
    });
    return result.gadgetMeta.directUploadToken;
  }

  toString() {
    return `GadgetAPIClient<${this.productionApiRoot}>`;
  }

  toJSON() {
    return this.toString()
  }
}
