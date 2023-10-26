function disambiguateActionParams(action, idValue, variables = {}) {
  if (action.hasAmbiguousIdentifier) {
    if (Object.keys(variables).some((key) => !action.paramOnlyVariables?.includes(key) && key !== action.modelApiIdentifier)) {
      throw Error(`Invalid arguments found in variables. Did you mean to use ({ ${action.modelApiIdentifier}: { ... } })?`);
    }
  }
  let newVariables;
  const idVariable = Object.entries(action.variables).find(([key, value]) => key === "id" && value.type === "GadgetID");
  if (action.acceptsModelInput || action.hasCreateOrUpdateEffect) {
    if (action.modelApiIdentifier in variables && typeof variables[action.modelApiIdentifier] === "object" && variables[action.modelApiIdentifier] !== null || !action.variables[action.modelApiIdentifier]) {
      newVariables = variables;
    } else {
      newVariables = {
        [action.modelApiIdentifier]: {}
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
  newVariables["id"] ?? (newVariables["id"] = idValue);
  return newVariables;
}
export {
  disambiguateActionParams
};
//# sourceMappingURL=support.js.map
