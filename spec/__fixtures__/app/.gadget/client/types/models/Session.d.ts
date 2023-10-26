import { GadgetConnection, GadgetRecord, GadgetRecordList, DefaultSelection, LimitToKnownKeys, Selectable } from "@gadgetinc/api-client-core";
import { Query, Select, DeepFilterNever, Session, AvailableSessionSelection } from "../types.js";
export declare const DefaultSessionSelection: {
    readonly __typename: true;
    readonly createdAt: true;
    readonly id: true;
    readonly state: true;
    readonly updatedAt: true;
};
/**
* Produce a type that holds only the selected fields (and nested fields) of "session". The present fields in the result type of this are dynamic based on the options to each call that uses it.
* The selected fields are sometimes given by the `Options` at `Options["select"]`, and if a selection isn't made in the options, we use the default selection from above.
*/
export type SelectedSessionOrDefault<Options extends Selectable<AvailableSessionSelection>> = DeepFilterNever<Select<Session, DefaultSelection<AvailableSessionSelection, Options, typeof DefaultSessionSelection>>>;
/** Options that can be passed to the `SessionManager#findOne` method */
export interface FindOneSessionOptions {
    /** Select fields other than the defaults of the record to return */
    select?: AvailableSessionSelection;
}
/** Options that can be passed to the `SessionManager#maybeFindOne` method */
export interface MaybeFindOneSessionOptions {
    /** Select fields other than the defaults of the record to return */
    select?: AvailableSessionSelection;
}
/** Options that can be passed to the `SessionManager#findMany` method */
export interface FindManySessionsOptions {
    /** Select fields other than the defaults of the record to return */
    select?: AvailableSessionSelection;
    first?: number | null;
    last?: number | null;
    after?: string | null;
    before?: string | null;
}
/** Options that can be passed to the `SessionManager#findFirst` method */
export interface FindFirstSessionOptions {
    /** Select fields other than the defaults of the record to return */
    select?: AvailableSessionSelection;
}
/** Options that can be passed to the `SessionManager#maybeFindFirst` method */
export interface MaybeFindFirstSessionOptions {
    /** Select fields other than the defaults of the record to return */
    select?: AvailableSessionSelection;
}
/** All the actions available at the collection level and record level for "session" */
export declare class SessionManager {
    readonly connection: GadgetConnection;
    constructor(connection: GadgetConnection);
    /**
 * Finds one session by ID. Returns a Promise that resolves to the record if found and rejects the promise if the record isn't found.
 **/
    findOne: {
        <Options extends FindOneSessionOptions>(id: string, options?: LimitToKnownKeys<Options, FindOneSessionOptions>): Promise<GadgetRecord<SelectedSessionOrDefault<Options>>>;
        type: "findOne";
        findByVariableName: "id";
        operationName: "session";
        modelApiIdentifier: "session";
        defaultSelection: typeof DefaultSessionSelection;
        selectionType: AvailableSessionSelection;
        optionsType: FindOneSessionOptions;
        schemaType: Query["session"];
    };
    /**
 * Finds one session by ID. Returns a Promise that resolves to the record if found and rejects the promise if the record isn't found.
 **/
    maybeFindOne: {
        <Options extends MaybeFindOneSessionOptions>(id: string, options?: LimitToKnownKeys<Options, MaybeFindOneSessionOptions>): Promise<GadgetRecord<SelectedSessionOrDefault<Options>> | null>;
        type: "maybeFindOne";
        findByVariableName: "id";
        operationName: "session";
        modelApiIdentifier: "session";
        defaultSelection: typeof DefaultSessionSelection;
        selectionType: AvailableSessionSelection;
        optionsType: MaybeFindOneSessionOptions;
        schemaType: Query["session"];
    };
    /**
 * Finds many session. Returns a `Promise` for a `GadgetRecordList` of objects according to the passed `options`. Optionally filters the returned records using `filter` option, sorts records using the `sort` option, searches using the `search` options, and paginates using the `last`/`before` and `first`/`after` pagination options.
 **/
    findMany: {
        <Options extends FindManySessionsOptions>(options?: LimitToKnownKeys<Options, FindManySessionsOptions>): Promise<GadgetRecordList<SelectedSessionOrDefault<Options>>>;
        type: "findMany";
        operationName: "sessions";
        modelApiIdentifier: "session";
        defaultSelection: typeof DefaultSessionSelection;
        selectionType: AvailableSessionSelection;
        optionsType: FindManySessionsOptions;
        schemaType: Query["session"];
    };
    /**
 * Finds the first matching session. Returns a `Promise` that resolves to a record if found and rejects the promise if a record isn't found, according to the passed `options`. Optionally filters the searched records using `filter` option, sorts records using the `sort` option, searches using the `search` options, and paginates using the `last`/`before` and `first`/`after` pagination options.
 **/
    findFirst: {
        <Options extends FindFirstSessionOptions>(options?: LimitToKnownKeys<Options, FindFirstSessionOptions>): Promise<GadgetRecord<SelectedSessionOrDefault<Options>>>;
        type: "findFirst";
        operationName: "sessions";
        modelApiIdentifier: "session";
        defaultSelection: typeof DefaultSessionSelection;
        selectionType: AvailableSessionSelection;
        optionsType: FindFirstSessionOptions;
        schemaType: Query["session"];
    };
    /**
 * Finds the first matching session. Returns a `Promise` that resolves to a record if found, or null if a record isn't found, according to the passed `options`. Optionally filters the searched records using `filter` option, sorts records using the `sort` option, searches using the `search` options, and paginates using the `last`/`before` pagination options.
 **/
    maybeFindFirst: {
        <Options extends MaybeFindFirstSessionOptions>(options?: LimitToKnownKeys<Options, MaybeFindFirstSessionOptions>): Promise<GadgetRecord<SelectedSessionOrDefault<Options>> | null>;
        type: "maybeFindFirst";
        operationName: "sessions";
        modelApiIdentifier: "session";
        defaultSelection: typeof DefaultSessionSelection;
        selectionType: AvailableSessionSelection;
        optionsType: MaybeFindFirstSessionOptions;
        schemaType: Query["session"];
    };
    /**
  * Finds one session by its id. Returns a Promise that resolves to the record if found and rejects the promise if the record isn't found.
  **/
    findById: {
        <Options extends FindOneSessionOptions>(value: string, options?: LimitToKnownKeys<Options, FindOneSessionOptions>): Promise<GadgetRecord<SelectedSessionOrDefault<Options>>>;
        type: "findOne";
        findByVariableName: "id";
        operationName: "sessions";
        modelApiIdentifier: "session";
        defaultSelection: typeof DefaultSessionSelection;
        selectionType: AvailableSessionSelection;
        optionsType: FindOneSessionOptions;
        schemaType: Query["session"];
    };
}
