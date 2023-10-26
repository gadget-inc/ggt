export type StateValueMap = {
    [key: string]: StateValue;
};
type ModelBlob = any;
export type StateBlob = any;
/**
 * The value representing a state.
 *
 * For example,
 *
 * - `"created"`, for simple states;
 * - `{ "created": "unfulfilled" }`, for compound states; and
 * - `{ "created": { "fulfilled": "no", "reviewed": "no } } }`, for parallel states.
 */
export type StateValue = string | StateValueMap;
/**
 * A value storing the historical state values.
 *
 * For example,
 *
 * ```js
 * {
 *   current: "created",
 *   children: {
 *     created: {
 *       current: "fulfilled",
 *     },
 *     archive: {
 *       current: "softDeleted",
 *     },
 *   }
 * }
 * ```
 */
export type StateHistoryValue = {
    /** The name of the state that was previously active */
    current: string;
    /** Historical values of all nested states */
    children?: Record<string, StateHistoryValue>;
};
/** Data about a state, as returned by lookup by state key via `StateMapper` */
export type StateData = {
    /** The state value for a given state, as we'd persist it in the DB */
    value: StateValue;
    /** The API identifier for the state (can be changed by the user) */
    apiIdentifier: string;
    /** The `StateBlob` this state was derived from, as given to the app sandbox */
    blob: StateBlob;
    /** A path to key to this state from the root, useful with lodash's get/set */
    path: string[];
};
/** Determine if a given value is a state value */
export declare function isStateValue(value: any): value is StateValue;
/** Determine if a given value is a state history value */
export declare function isStateHistoryValue(value: any): value is StateHistoryValue;
/**
 * Map state keys to data on those states.
 *
 * The things in the state chart are deeply nested, so the `StateMapper` takes care of flattening this structure into an efficient lookup
 * table, based on the state keys.
 *
 * `StateMapper` also exposes functions to map back and forth between transit state values (using the API identifiers) and storage state
 * values (using state keys).
 */
export declare class StateMapper {
    readonly model: ModelBlob;
    stateKeyToDataMap: {
        [key: string]: StateData;
    };
    constructor(model: ModelBlob);
    mapStorageValueToApiIdentifiers(stateValue: StateValue): StateValue;
    mapApiIdentifiersToStorageValue(stateValue: StateValue): StateValue;
    mapStorageHistoryValueToApiIdentifiers(stateHistoryValue: StateHistoryValue): StateHistoryValue;
    mapApiIdentifiersToStorageHistoryValue(stateHistoryValue: StateHistoryValue): StateHistoryValue;
    stateKeyToData(stateKey: string): StateData;
    get apiIdentifierToStateKeyMap(): Record<string, any>;
    populateStateMaps(states: StateBlob[], path: string[]): void;
}
/**
 * Compute a state value, from a "path" of identifiers.
 *
 * **NOTE**: State values are persisted, so bear that in mind when changing the shape.
 */
export declare function stateValueFromPath(path: string[]): StateValue;
/**
 * Flatten a state value.
 *
 * For example,
 *
 * ```json
 * { "created": { "unfulfilled": "needsReview" } } }
 * ```
 *
 * will be flattened into `["created", "unfulfilled", "needsReview"]`
 */
export declare function flattenStateValue(state: StateValue): string[];
export {};
