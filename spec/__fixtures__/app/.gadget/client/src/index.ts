/**
* This is the Gadget API client library for:
*
*   _____         _   
*  |_   _|__  ___| |_ 
*    | |/ _ \/ __| __|
*    | |  __/\__ \ |_ 
*    |_|\___||___/\__|
*                     
*
* Built for environment "Development" at version 4
* API docs: https://docs.gadget.dev/api/test
* Edit this app here: https://test.gadget.app/edit
*/
export {
  BrowserSessionStorageType, GadgetClientError, GadgetConnection, GadgetInternalError, GadgetOperationError, GadgetRecord,
  GadgetRecordList, GadgetValidationError, InvalidRecordError
} from "@gadgetinc/api-client-core";

export type { AuthenticationModeOptions, BrowserSessionAuthenticationModeOptions, ClientOptions, InvalidFieldError, Select } from "@gadgetinc/api-client-core";

export * from "./Client.js";
export * from "./types.js";

declare global {
  interface Window {
    gadgetConfig: {
      apiKeys: {
        shopify: string;
      };
      environment: string;
      env: Record<string, any>;
      authentication?: {
        signInPath: string;
        redirectOnSuccessfulSignInPath: string;
      }
    };
  }
}
