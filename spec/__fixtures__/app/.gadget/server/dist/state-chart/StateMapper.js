"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flattenStateValue = exports.stateValueFromPath = exports.StateMapper = exports.isStateHistoryValue = exports.isStateValue = void 0;
const utils_1 = __importStar(require("../utils"));
/** Deeply map the keys/values of a state value */
function mapStateValue(state, mapper) {
    if ((0, utils_1.isObject)(state)) {
        const result = {};
        for (const [key, value] of Object.entries(state)) {
            result[mapper(key)] = mapStateValue(value, mapper);
        }
        return result;
    }
    return mapper(state);
}
/** Deeply map the keys/values of a state history value */
function mapStateHistoryValue(state, mapper) {
    const result = {
        current: mapper(state.current),
    };
    if (state.children) {
        result.children = {};
        for (const [name, history] of Object.entries(state.children)) {
            result.children[mapper(name)] = mapStateHistoryValue(history, mapper);
        }
    }
    return result;
}
/** Determine if a given value is a state value */
function isStateValue(value) {
    if ((0, utils_1.isString)(value)) {
        return true;
    }
    if (!(0, utils_1.isObject)(value)) {
        return false;
    }
    return Object.entries(value).every(([key, value]) => (0, utils_1.isString)(key) && isStateValue(value));
}
exports.isStateValue = isStateValue;
/** Determine if a given value is a state history value */
function isStateHistoryValue(value) {
    if (!(0, utils_1.isObject)(value)) {
        return false;
    }
    const record = value;
    if (!("current" in record) || !(0, utils_1.isString)(record.current)) {
        return false;
    }
    if ("children" in record && record.children) {
        if (!(0, utils_1.isObject)(record.children)) {
            return false;
        }
        return Object.values(record.children).every((v) => isStateHistoryValue(v));
    }
    return true;
}
exports.isStateHistoryValue = isStateHistoryValue;
/**
 * Map state keys to data on those states.
 *
 * The things in the state chart are deeply nested, so the `StateMapper` takes care of flattening this structure into an efficient lookup
 * table, based on the state keys.
 *
 * `StateMapper` also exposes functions to map back and forth between transit state values (using the API identifiers) and storage state
 * values (using state keys).
 */
class StateMapper {
    constructor(model) {
        this.model = model;
        this.stateKeyToDataMap = {};
        this.populateStateMaps(model.stateChart.childStates, []);
    }
    mapStorageValueToApiIdentifiers(stateValue) {
        return mapStateValue(stateValue, (key) => {
            if (key in this.stateKeyToDataMap) {
                return this.stateKeyToDataMap[key].apiIdentifier;
            }
            return key;
        });
    }
    mapApiIdentifiersToStorageValue(stateValue) {
        return mapStateValue(stateValue, (apiIdentifier) => {
            if (apiIdentifier in this.apiIdentifierToStateKeyMap) {
                return this.apiIdentifierToStateKeyMap[apiIdentifier];
            }
            return apiIdentifier;
        });
    }
    mapStorageHistoryValueToApiIdentifiers(stateHistoryValue) {
        return mapStateHistoryValue(stateHistoryValue, (key) => {
            if (key in this.stateKeyToDataMap) {
                return this.stateKeyToDataMap[key].apiIdentifier;
            }
            return key;
        });
    }
    mapApiIdentifiersToStorageHistoryValue(stateHistoryValue) {
        return mapStateHistoryValue(stateHistoryValue, (apiIdentifier) => {
            if (apiIdentifier in this.apiIdentifierToStateKeyMap) {
                return this.apiIdentifierToStateKeyMap[apiIdentifier];
            }
            return apiIdentifier;
        });
    }
    stateKeyToData(stateKey) {
        return (0, utils_1.assert)(this.stateKeyToDataMap[stateKey], `state key "${stateKey}" not found in state map`);
    }
    get apiIdentifierToStateKeyMap() {
        return (0, utils_1.invert)((0, utils_1.default)(this.stateKeyToDataMap, ({ apiIdentifier }) => apiIdentifier));
    }
    populateStateMaps(states, path) {
        for (const state of states) {
            path.push(state.apiIdentifier);
            this.stateKeyToDataMap[state.key] = {
                apiIdentifier: state.apiIdentifier,
                blob: state,
                value: stateValueFromPath(path),
                path: path.slice(),
            };
            if (state.childStates) {
                this.populateStateMaps(state.childStates, path);
            }
            path.pop();
        }
    }
}
exports.StateMapper = StateMapper;
/**
 * Compute a state value, from a "path" of identifiers.
 *
 * **NOTE**: State values are persisted, so bear that in mind when changing the shape.
 */
function stateValueFromPath(path) {
    if (path.length == 0) {
        // Note, we're not throwing a special error here because we're in control of the code that calls this method, and should always pass in a non-empty path
        throw new Error("can't compute state value from an empty path");
    }
    if (path.length == 1) {
        return path[0];
    }
    let index = path.length - 1;
    let stateValue = path[index];
    while (--index >= 0) {
        const stateApiIdentifier = path[index];
        stateValue = { [stateApiIdentifier]: stateValue };
    }
    return stateValue;
}
exports.stateValueFromPath = stateValueFromPath;
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
function flattenStateValue(state) {
    if ((0, utils_1.isString)(state)) {
        return [state];
    }
    if ((0, utils_1.isEmpty)(state)) {
        return [];
    }
    const [key, stateValue] = Object.entries(state)[0];
    return [key, ...flattenStateValue(stateValue)];
}
exports.flattenStateValue = flattenStateValue;
//# sourceMappingURL=StateMapper.js.map