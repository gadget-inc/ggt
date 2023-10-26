import { NoTransitionError } from "../errors";
import { Globals } from "../globals";
import type { StateData, StateHistoryValue, StateMapper, StateValue } from "./StateMapper";
import { flattenStateValue } from "./StateMapper";

type ActionContext = any;
/**
 * Get the states we could potentially transition from given the initial state.
 *
 * Based on the state value, we have many possible states that could receive the incoming actions. For example, with the state value
 *
 *     { "created": { "unfulfilled": "needsReview" } } }
 *
 * we can run actions on three possible states: "created", "created.unfulfilled", and "created.unfulfilled.needsReview". We flatten
 * this state value into the set of state keys for each of these to create the possible transition state.
 */

export const possibleTransitionStates = ({ record, model }: ActionContext, mapper: StateMapper) => {
  const state = record.state;
  if (state) {
    const stateValue = mapper.mapApiIdentifiersToStorageValue(state);
    return Globals.platformModules.lodash().map(flattenStateValue(stateValue), (key: string) => mapper.stateKeyToData(key));
  } else if (model.stateChart.initialChildStateKey) {
    const startState = mapper.stateKeyToData(model.stateChart.initialChildStateKey);
    return [startState];
  }
  return [];
};

/**
 * Check if we can execute the action.
 *
 * A transition can be taken if there is a possible transition state that has the same from key as the transition we'd like to take.
 *
 * @throws {NoTransitionError} if none of the possible transition states
 */
export const checkCanExecute = (context: ActionContext, mapper: StateMapper) => {
  const receivingState = Globals.platformModules
    .lodash()
    .find(possibleTransitionStates(context, mapper), ["blob.key", context.transition.fromStateKey]);
  if (!receivingState) {
    const {
      record: { state },
    } = context;

    let stateName = "<unknown>";
    if (Globals.platformModules.lodash().isString(state)) {
      stateName = state;
    } else if (Globals.platformModules.lodash().isObjectLike(state)) {
      stateName = JSON.stringify(state);
    } else if (context.model.stateChart.initialChildStateKey) {
      const initialStateKey = context.model.stateChart.initialChildStateKey;
      const state = Globals.platformModules.lodash().find(context.model.stateChart.childStates, { key: initialStateKey });
      if (state) {
        stateName = state.name;
      }
    }

    let errorMessage = `Invalid action for the ${context.model.apiIdentifier} model. Unable to execute the "${context.action.apiIdentifier}" action in state "${stateName}".`;
    if (context.action.apiIdentifier == "logInViaEmail") {
      errorMessage = `Invalid action for the ${context.model.apiIdentifier} model. This session is already logged in for ${context.params.email}.`;
    }
    throw new NoTransitionError(errorMessage);
  }
};

/**
 * Incorporate a given state value into an existing historical state.
 *
 * For example, if we have the following history and state:
 *
 * ```js
 * const history = {
 *   current: "created",
 *   children: {
 *     created: {
 *       current: "unfulfilled"
 *     },
 *     archived: {
 *       current: "softDeleted"
 *     }
 *   }
 * };
 *
 * const state = { created: "fulfilled" };
 * ```
 *
 * the new historical state would be
 *
 * ```js
 * const history = {
 *   current: "created",
 *   children: {
 *     created: {
 *       current: "fulfilled"
 *     },
 *     archived: {
 *       current: "softDeleted"
 *     }
 *   }
 * };
 * ```
 *
 * Semantically, we set the value of "current" (in the history) at every point along the state value "path".
 */
export const computeStateHistory = (history: StateHistoryValue, state: StateValue): StateHistoryValue => {
  const newHistory: StateHistoryValue = history ? Globals.platformModules.lodash().cloneDeep(history) : { current: "" };
  const path = [];
  while (Globals.platformModules.lodash().isObject(state)) {
    const [current, newState] = Object.entries(state)[0];

    path.push("current");
    Globals.platformModules.lodash().set(newHistory, path, current);
    path.pop();

    path.push("children");
    path.push(current);

    state = newState;
  }

  path.push("current");
  Globals.platformModules.lodash().set(newHistory, path, state);

  return newHistory;
};

/**
 * Find the state value for the state we'll be transitioning into.
 *
 * For states without children, the state value will just be the state we're transitioning to.
 *
 * For states with children, we need to restore the child state from history. A historical value is used if:
 * 1. there actually is a historical value (in other words, is not `undefined`),
 * 2. the state requests history to be restored, and
 * 3. the historical value is for a nested state that actually exists.
 *
 * We recursively repeat the above. Once finished, if we're still at a state that has children, we go as deep as possible using the
 * child states that are configured to be the initial.
 */
export const computeStateValueFor = (history: StateHistoryValue, state: StateData, mapper: StateMapper): StateValue => {
  // This will be the "path" to the penultimate state in the state value we return. For example, if the state value we
  // return is `{ a: { b: "c" } }`, the path will be `["a", "b"]`.
  const path = Globals.platformModules.lodash().clone(state.path);

  // A path to dig into the historical value. The historical value nests every state under "children", hence the `flatMap`.
  const historyPath = path.flatMap((segment: string) => ["children", segment]);

  while (state.blob.initialChildStateKey) {
    // Rule (2) above
    if (state.blob.restoreHistory) {
      // The value we potentially want to restore is under the "current" key in the history value, so temporarily push "current" into the
      // path so we can grab it, but pop it again because we may recurse further.
      historyPath.push("current");
      const apiIdentifier = Globals.platformModules.lodash().get(history, historyPath) as string;
      historyPath.pop();

      // Rules (1) and (3) above. If there's no historical value, the `get` above will return undefined, and no child state should
      // have an undefined API identifier, so we'll hit the break below.
      const maybeChildState = Globals.platformModules.lodash().find(state.blob.childStates, { apiIdentifier });
      if (maybeChildState) {
        historyPath.push("children");
        historyPath.push(apiIdentifier);
        path.push(apiIdentifier);
        state = mapper.stateKeyToData(maybeChildState.key);
        continue;
      }
    }

    break;
  }

  path.pop();

  // Now that we've went as deep into history as possible, initial the rest of the nested states with the initial states
  while (state.blob.initialChildStateKey) {
    path.push(state.blob.apiIdentifier);
    state = mapper.stateKeyToData(state.blob.initialChildStateKey);
  }

  // Special case for a root state, just return the API identifier. For example, if the created state has no nested states, the
  // actual state value will be `"created"`, not `{ created: ??? }`.
  if (Globals.platformModules.lodash().isEmpty(path)) {
    return state.apiIdentifier;
  }

  // `set` will ensure all intermediate objects are initialized. So `set({}, ['a', 'b'], 'c')` will give us `{ a: { b: "c" } }`
  return Globals.platformModules.lodash().set({}, path, state.apiIdentifier);
};

export const _doStateTransition = (
  currentHistory: StateHistoryValue,
  currentState: StateValue,
  toState: StateData,
  mapper: StateMapper,
  record: any
) => {
  const newHistory = computeStateHistory(currentHistory, currentState);

  // It's important that we use the new history value here, instead of `recordStateHistory`, in case of a self transition. The historical
  // value contains the position we were in _previously_. That means that if we did a self transition, we'd revert to the previous state
  // (if it were different than the current state).
  const newState = computeStateValueFor(newHistory, toState, mapper);

  record.state = newState;
  record.stateHistory = newHistory;
  return { newState, newHistory };
};

export const doStateTransition = (context: ActionContext, mapper: StateMapper) => {
  const toState = mapper.stateKeyToData(context.transition.toStateKey);
  const currentState = Globals.platformModules.lodash().cloneDeep(context.record.state);
  const currentHistory = Globals.platformModules.lodash().cloneDeep(context.record.stateHistory);

  return _doStateTransition(currentHistory, currentState, toState, mapper, context.record);
};

// In case the state still hasn't been persisted, ensure the state change still happens
export const persistStateTransition = async (newState: any, newHistory: any, context: ActionContext) => {
  if (context.record.changed("state") || context.record.changed("stateHistory")) {
    await updateState(context, newState, newHistory);
  }
};

/** Persist the new state into the model record */
export const updateState = async (
  { api, model, record, scope, logger }: ActionContext,
  newState: StateValue,
  stateHistory: StateHistoryValue
) => {
  if (record.id && !scope.recordDeleted) {
    await api.internal[model.apiIdentifier].update(record.id, { [model.apiIdentifier]: { state: newState, stateHistory } });
    logger.debug("updated record state");
  }
};

export { StateMapper, isStateHistoryValue, isStateValue } from "./StateMapper";
export type { StateHistoryValue, StateValue, StateValueMap } from "./StateMapper";
