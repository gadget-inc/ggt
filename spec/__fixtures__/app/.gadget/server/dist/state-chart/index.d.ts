import type { StateData, StateHistoryValue, StateMapper, StateValue } from "./StateMapper";
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
export declare const possibleTransitionStates: ({ record, model }: ActionContext, mapper: StateMapper) => any;
/**
 * Check if we can execute the action.
 *
 * A transition can be taken if there is a possible transition state that has the same from key as the transition we'd like to take.
 *
 * @throws {NoTransitionError} if none of the possible transition states
 */
export declare const checkCanExecute: (context: ActionContext, mapper: StateMapper) => void;
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
export declare const computeStateHistory: (history: StateHistoryValue, state: StateValue) => StateHistoryValue;
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
export declare const computeStateValueFor: (history: StateHistoryValue, state: StateData, mapper: StateMapper) => StateValue;
export declare const _doStateTransition: (currentHistory: StateHistoryValue, currentState: StateValue, toState: StateData, mapper: StateMapper, record: any) => {
    newState: StateValue;
    newHistory: StateHistoryValue;
};
export declare const doStateTransition: (context: ActionContext, mapper: StateMapper) => {
    newState: StateValue;
    newHistory: StateHistoryValue;
};
export declare const persistStateTransition: (newState: any, newHistory: any, context: ActionContext) => Promise<void>;
/** Persist the new state into the model record */
export declare const updateState: ({ api, model, record, scope, logger }: ActionContext, newState: StateValue, stateHistory: StateHistoryValue) => Promise<void>;
export { StateMapper, isStateHistoryValue, isStateValue } from "./StateMapper";
export type { StateHistoryValue, StateValue, StateValueMap } from "./StateMapper";
