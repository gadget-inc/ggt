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
export function disambiguateActionParams<Action extends ActionFunction<any, any, any, any, any>>(
  action: Action,
  idValue: string | undefined,
  variables: Record<string, any> = {},
): Record<string, any> {
  if (action.hasAmbiguousIdentifier) {
    if (Object.keys(variables).some((key) => !action.paramOnlyVariables?.includes(key) && key !== action.modelApiIdentifier)) {
      throw Error(`Invalid arguments found in variables. Did you mean to use ({ ${action.modelApiIdentifier}: { ... } })?`);
    }
  }

  let newVariables: Record<string, any>;
  const idVariable = Object.entries(action.variables).find(([key, value]) => key === "id" && value.type === "GadgetID");

  if ((action as any).acceptsModelInput || action.hasCreateOrUpdateEffect) {
    if (
      (action.modelApiIdentifier in variables &&
      typeof variables[action.modelApiIdentifier] === "object" &&
      variables[action.modelApiIdentifier] !== null) || !action.variables[action.modelApiIdentifier]
    ) {
      newVariables = variables;
    } else {
      newVariables = {
        [action.modelApiIdentifier]: {},
      };
      for (const [key, value] of Object.entries(variables)) {
        if (action.paramOnlyVariables?.includes(key)) {
          newVariables[key] = value;
        } else {
          if (idVariable && key === idVariable[0]) {
            newVariables["id"] = value;
          } else {
            newVariables[action.modelApiIdentifier][key] = value;
          }
        }
      }
    }
  } else {
    newVariables = variables;
  }

  newVariables["id"] ??= idValue as any;

  return newVariables;
}
