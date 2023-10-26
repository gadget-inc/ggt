export declare function assert<T>(value: T | false | undefined | null, message?: string): T;
export declare function isObject(value: any): boolean;
export declare function isObjectLike(value: any): boolean;
export declare function isFunction(value: any): boolean;
export declare function isArrayLike(value: any): boolean;
export declare function isEmpty(value: null | undefined | any[] | object): boolean;
export declare function isString(value: any): boolean;
export declare function keyBy<T>(array: T[], iteratee: keyof T | ((value: T) => string)): Record<string, T>;
export declare function pickBy<T extends object>(object: T, predicate: (value: T[keyof T], key: keyof T) => boolean): Partial<T>;
/**
 * Creates an object composed of the inverted keys and values of `object`.
 * If `object` contains duplicate values, subsequent values overwrite
 * property assignments of previous values.
 *
 * @since 0.7.0
 * @category Object
 * @param {Object} object The object to invert.
 * @returns {Object} Returns the new inverted object.
 * @example
 *
 * const object = { 'a': 1, 'b': 2, 'c': 1 }
 *
 * invert(object)
 * // => { '1': 'c', '2': 'b' }
 */
export declare function invert(object: any): Record<string, any>;
declare function mapValue(object: any, iteratee: any): Record<string, any>;
export default mapValue;
export declare const defaults: (...args: any[]) => any;
