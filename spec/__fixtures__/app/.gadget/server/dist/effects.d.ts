import { GadgetRecord } from "@gadgetinc/api-client-core";
import type { AnyParams } from "./types";
export declare function createGadgetRecord<Shape>(apiIdentifier: string, data: Shape): GadgetRecord<Shape & {
    __typename: string;
}>;
/**
 * Set incoming parameters onto a `record` object.
 *
 * @param params - Parameters for setting, usually from an action context or a  to set on the record
 * @param record - Record to apply parameters to
 */
export declare function applyParams(params: AnyParams, record: GadgetRecord<any>): void;
/**
 * Validates the given record, then creates or updates the record in the database.
 *
 * If any validation errors are encountered, they'll be thrown as a GadgetValidationError.
 *
 * Uses the Internal API for your application to persist data.
 *
 * The record param must have a `__typename` parameter.
 *
 * @param record - Record to save to the database
 */
export declare function save(record: GadgetRecord<any>): Promise<void>;
/**
 * Deletes the given record from your database.
 *
 * @param record - Record to delete from the database
 */
export declare function deleteRecord(record: GadgetRecord<any>): Promise<void>;
export declare const ShopifyShopState: {
    Installed: {
        created: string;
    };
    Uninstalled: {
        created: string;
    };
};
export declare const ShopifySyncState: {
    Created: string;
    Running: string;
    Completed: string;
    Errored: string;
};
export declare const ShopifyBulkOperationState: {
    Created: string;
    Completed: string;
    Canceled: string;
    Failed: string;
    Expired: string;
};
export declare const ShopifySellingPlanGroupProductVariantState: {
    Started: string;
    Created: string;
    Deleted: string;
};
export declare const ShopifySellingPlanGroupProductState: {
    Started: string;
    Created: string;
    Deleted: string;
};
export declare function transitionState(record: GadgetRecord<any>, transition: {
    from?: string | Record<string, string>;
    to: string | Record<string, string>;
}): void;
export declare function shopifySync(params: AnyParams, record: GadgetRecord<any>): Promise<void>;
/**
 * Enforce that the given record is only accessible by the current shop. For multi-tenant Shopify applications, this is key for enforcing data can only be accessed by the shop that owns it.
 *
 * For existing records, this function verifies the record object has the same `shopId` as the shop in the current session, and throws if not
 * For new records, this function sets the record's `shopId` to the current session's `shopId`.
 *
 * The `shopBelongsToField` option is a required parameter if the model has more than one related shop field to specify which field to use.
 *
 * @param params - Incoming parameters, validated against the current `shopId`
 * @param record - Record to validate or set the `shopId` on
 * @param options - Options for the function
 */
export declare function preventCrossShopDataAccess(params: AnyParams, record: GadgetRecord<any>, options?: {
    shopBelongsToField: string;
}): Promise<void>;
export declare function finishBulkOperation(record: GadgetRecord<any>): Promise<void>;
export declare function globalShopifySync(params: {
    apiKeys: string[];
    syncSince: string;
    models: string[];
    force: boolean;
    startReason: string;
}): Promise<void>;
export declare function legacySetUser(): void;
export declare function legacyUnsetUser(): void;
export declare function legacySuccessfulAuthentication(params: AnyParams): Promise<void>;
export declare enum FieldType {
    ID = "ID",
    Number = "Number",
    String = "String",
    Enum = "Enum",
    RichText = "RichText",
    DateTime = "DateTime",
    Email = "Email",
    URL = "URL",
    Money = "Money",
    File = "File",
    Color = "Color",
    Password = "Password",
    Computed = "Computed",
    HasManyThrough = "HasManyThrough",
    BelongsTo = "BelongsTo",
    HasMany = "HasMany",
    HasOne = "HasOne",
    Boolean = "Boolean",
    Model = "Model",
    Object = "Object",
    Array = "Array",
    JSON = "JSON",
    Code = "Code",
    EncryptedString = "EncryptedString",
    Vector = "Vector",
    /**
     * Any value at all.
     * Prefer FieldType.JSON where possible, it's more descriptive.
     */
    Any = "Any",
    Null = "Null",
    RecordState = "RecordState",
    RoleAssignments = "RoleAssignments"
}
