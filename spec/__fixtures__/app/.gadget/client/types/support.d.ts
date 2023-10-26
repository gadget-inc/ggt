import type { ActionFunction } from "@gadgetinc/api-client-core";
/**
 * Maps the variables passed from a call to the client to the variables the GraphQL API is expecting
 *
 * For actions which accept a model input, the GraphQL API expects the variables to be passed like
 *  id: 123,
 *  widget: { fieldA: "a", fieldB: "b" },
 *  extraParam: "C"
 *
 * For convenience, we allow actions to be invoked like
 *   await api.widget.update("123", {fieldA: "a", fieldB: "b", extraParam: "C"})
 *
 * This function re-nests the model input variables under a key for the model's api identifier, being careful to leave root level params alone.
 **/
export declare function disambiguateActionParams<Action extends ActionFunction<any, any, any, any, any>>(action: Action, idValue: string | undefined, variables?: Record<string, any>): Record<string, any>;
