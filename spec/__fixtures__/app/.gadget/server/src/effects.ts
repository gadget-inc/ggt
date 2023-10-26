import type { RecordData } from "@gadgetinc/api-client-core";
import { ChangeTracking, GadgetRecord } from "@gadgetinc/api-client-core";
import {
  InternalError,
  InvalidActionInputError,
  InvalidStateTransitionError,
  MisconfiguredActionError,
  NoSessionForAuthenticationError,
  PermissionDeniedError,
  UserNotSetOnSessionError,
} from "./errors";
import { Globals, actionContextLocalStorage } from "./globals";
import { modelListIndex, modelsMap } from "./metadata";
import { AppTenancyKey } from "./tenancy";
import type { AnyParams, ModelMetadata, NotYetTyped } from "./types";
import { assert } from "./utils";

function getBelongsToRelationParams(model: ModelMetadata, params: Record<string, any>) {
  const belongsToParams: any = {};

  for (const field of Object.values(model.fields) as any[]) {
    if (field.fieldType != "BelongsTo") continue;
    const modelParams = typeof params[model.apiIdentifier] === "object" ? params[model.apiIdentifier] : undefined;
    const belongsToParam =
      modelParams && typeof modelParams[field.apiIdentifier] === "object" ? modelParams[field.apiIdentifier] : undefined;
    const belongsToId = belongsToParam?.[LINK_PARAM] !== undefined ? belongsToParam[LINK_PARAM] : belongsToParam?.id;
    if (belongsToId !== undefined) {
      belongsToParams[`${field.apiIdentifier}Id`] = belongsToId;
    }
  }

  return belongsToParams;
}

export function createGadgetRecord<Shape>(apiIdentifier: string, data: Shape): GadgetRecord<Shape & { __typename: string }> {
  const model = getModelByApiIdentifier(apiIdentifier);
  return new GadgetRecord({
    ...data,
    __typename: model.graphqlTypeName,
  });
}

/**
 * Set incoming parameters onto a `record` object.
 *
 * @param params - Parameters for setting, usually from an action context or a  to set on the record
 * @param record - Record to apply parameters to
 */
export function applyParams(params: AnyParams, record: GadgetRecord<any>) {
  const model = getModelByTypename(record.__typename);

  // override the record with any new params, including relationId params from any _link params on belongs to relationships
  // Change the code snippet in `ApplyParamsDetailsPanel.tsx` when the code below updates
  Object.assign(record, params[model.apiIdentifier], getBelongsToRelationParams(model, params));
}

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
export async function save(record: GadgetRecord<any>) {
  const context = maybeGetActionContextFromLocalStorage();
  const api = assert(context ? context.api : getCurrentContext().api, "api client is missing from the current context");
  const model = getModelByTypename(record.__typename);

  await (await Globals.modelValidator(model.key)).validate({ api, logger: Globals.logger }, record);

  if (!api.internal[model.apiIdentifier]) {
    throw new InternalError(
      `Gadget API client doesn't have an internal model manager for ${model.apiIdentifier} to run a Save Record function -- has it finished regenerating or was it recently removed?`
    );
  }

  let result: GadgetRecord<any>;

  if ("createdAt" in record && record.createdAt) {
    result = await api.internal[model.apiIdentifier].update(record.id, {
      [model.apiIdentifier]: changedAttributes(model, record),
    });
  } else {
    result = await api.internal[model.apiIdentifier].create({
      [model.apiIdentifier]: writableAttributes(model, record),
    });
  }

  Object.assign(record, { ...result });
  record.flushChanges(ChangeTracking.SinceLastPersisted);
}

/**
 * Deletes the given record from your database.
 *
 * @param record - Record to delete from the database
 */
export async function deleteRecord(record: GadgetRecord<any>) {
  const context = maybeGetActionContextFromLocalStorage();

  const api = assert(context ? context.api : getCurrentContext().api, "api client is missing from the current context");
  const scope = context ? context.scope : {};
  const model = getModelByTypename(record.__typename);

  const id = assert(record.id, `record.id not set on record in scope, has the record been persisted?`);

  if (!api.internal[model.apiIdentifier]) {
    throw new InternalError(
      `Gadget API client doesn't have an internal model manager for ${model.apiIdentifier} to run a Delete Record effect -- has it finished regenerating or was it recently removed?`
    );
  }

  await api.internal[model.apiIdentifier].delete(id);
  scope.recordDeleted = true;
}

export const ShopifyShopState = {
  Installed: { created: "installed" },
  Uninstalled: { created: "uninstalled" },
};

export const ShopifySyncState = {
  Created: "created",
  Running: "running",
  Completed: "completed",
  Errored: "errored",
};

export const ShopifyBulkOperationState = {
  Created: "created",
  Completed: "completed",
  Canceled: "canceled",
  Failed: "failed",
  Expired: "expired",
};

export const ShopifySellingPlanGroupProductVariantState = {
  Started: "started",
  Created: "created",
  Deleted: "deleted",
};

export const ShopifySellingPlanGroupProductState = {
  Started: "started",
  Created: "created",
  Deleted: "deleted",
};

export function transitionState(
  record: GadgetRecord<any>,
  transition: {
    from?: string | Record<string, string>;
    to: string | Record<string, string>;
  }
) {
  const stringRecordState = typeof record.state === "string" ? record.state : JSON.stringify(record.state);
  const stringTransitionFrom = typeof transition.from === "string" ? transition.from : JSON.stringify(transition.from);

  if (transition.from && stringRecordState !== stringTransitionFrom) {
    throw new InvalidStateTransitionError(undefined, {
      state: record.state,
      expectedFrom: transition.from,
    });
  }

  record.state = transition.to;
}

export async function shopifySync(params: AnyParams, record: GadgetRecord<any>) {
  const context = getActionContextFromLocalStorage();
  const effectAPIs = context.effectAPIs;

  const syncRecord: { syncSince?: Date; id: bigint; shopId: string; models: any; force: boolean } = assert(
    record,
    "cannot start a shop sync from this action"
  );

  const shopId = assert(syncRecord.shopId, "a shop is required to start a sync");

  // verify that models is an array of strings if defined

  if (!syncRecord.models || (Array.isArray(syncRecord.models) && syncRecord.models.every((m) => typeof m == "string"))) {
    try {
      await effectAPIs.sync(
        syncRecord.id.toString(),
        shopId,
        syncRecord.syncSince,
        syncRecord.models,
        syncRecord.force,
        params.startReason
      );
    } catch (error) {
      Globals.logger.error({ error, connectionSyncId: syncRecord.id }, "an error occurred starting shop sync");
      throw error;
    }
  } else {
    throw new InvalidActionInputError("Models must be an array of api identifiers");
  }
}

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
export async function preventCrossShopDataAccess(params: AnyParams, record: GadgetRecord<any>, options?: { shopBelongsToField: string }) {
  const context = getActionContextFromLocalStorage();
  if (context.type != "effect") {
    throw new Error("Can't prevent cross shop data access outside of an action effect");
  }
  if (!params) {
    throw new Error(
      "The `params` parameter is required in preventCrossShopDataAccess(params, record, options?: { shopBelongsToField: string })"
    );
  }
  if (!record) {
    throw new Error(
      "The `record` parameter is required in preventCrossShopDataAccess(params, record, options?: { shopBelongsToField: string })"
    );
  }
  const model = context.model;
  const appTenancy = context[AppTenancyKey];
  const shopBelongsToField = options?.shopBelongsToField;

  // if there's no tenancy let's continue
  if (appTenancy?.shopify?.shopId === undefined) {
    return;
  }

  // if this effect is not run in the context of a model then it does not apply
  if (!model) {
    return;
  }

  const shopId = String(appTenancy.shopify.shopId);

  // If this effect is being added to the Shopify Shop model, simply compare the record's ID
  if (model.key == ShopifyShopKey) {
    if (record && String(record.id) !== shopId) {
      throw new PermissionDeniedError();
    }
    return;
  }

  const fieldsIsBelongsToShopifyShop = Object.values(model.fields).filter(
    (f) => f.fieldType === FieldType.BelongsTo && f.configuration.relatedModelKey === ShopifyShopKey
  );

  if (fieldsIsBelongsToShopifyShop.length === 0) {
    throw new MisconfiguredActionError("This model is missing a related shop field.");
  }

  if (fieldsIsBelongsToShopifyShop.length > 1 && !shopBelongsToField) {
    throw new MisconfiguredActionError(
      "This function is missing a related shop field option. `shopBelongsToField` is a required option parameter if the model has more than one related shop field."
    );
  }

  let relatedField = fieldsIsBelongsToShopifyShop[0];

  if (shopBelongsToField) {
    const selectedField = Object.values(model.fields).find((f) => f.apiIdentifier === shopBelongsToField);
    if (!selectedField) {
      throw new MisconfiguredActionError("The selected shop relation field does not exist.");
    }

    if (selectedField.fieldType !== FieldType.BelongsTo || selectedField.configuration.relatedModelKey !== ShopifyShopKey) {
      throw new MisconfiguredActionError(
        "The selected shop relation field should be a `Belongs To` relationship to the `Shopify Shop` model."
      );
    } else {
      relatedField = selectedField;
    }
  }

  const input = params[model.apiIdentifier];

  // if we're trying to set the params to a shop other than the tenant we should reject
  if (Globals.platformModules.lodash().isObjectLike(input)) {
    const objectInput = input as Record<string, any>;
    if (objectInput[relatedField.apiIdentifier]) {
      if (String(objectInput[relatedField.apiIdentifier][LINK_PARAM]) !== shopId) {
        throw new PermissionDeniedError();
      }
    } else {
      objectInput[relatedField.apiIdentifier] = {
        [LINK_PARAM]: shopId,
      };
    }
  } else {
    params[model.apiIdentifier] = {
      [relatedField.apiIdentifier]: {
        [LINK_PARAM]: shopId,
      },
    };
  }

  if (record) {
    const value = record.getField(relatedField.apiIdentifier);

    // if the record doesn't have a shop set then anyone can update it
    if (value) {
      const recordShopId = typeof value === "object" ? value[LINK_PARAM] : value;
      if (String(recordShopId) !== shopId) {
        throw new PermissionDeniedError();
      }
    } else {
      // we have to re-apply the params to the record to ensure that this effect still works correctly if it occurs after "apply params"
      record.setField(relatedField.apiIdentifier, {
        [LINK_PARAM]: shopId,
      });
    }
  }
}

export async function finishBulkOperation(record: GadgetRecord<any>) {
  if (!record?.id) {
    Globals.logger.warn(`Expected bulk operation record to be present for action`);
    return;
  }

  const context = getActionContextFromLocalStorage();
  const shopifyAPI = await (context.connections as Record<string, any>).shopify.forShopId(record.shopId);
  if (!shopifyAPI) {
    Globals.logger.error(`Could not instantiate Shopify client for shop ID ${record.shopId}`);
    return;
  }
  const bulkOperation = (
    await shopifyAPI.graphql(`query {
        node(id: "${ShopifyBulkOperationGIDForId(record.id)}") {
          ... on BulkOperation {
            id
            status
            errorCode
            createdAt
            completedAt
            objectCount
            fileSize
            url
            type
            partialDataUrl
            rootObjectCount
          }
        }
      }`)
  ).node;

  // normalize the mixed upper/lowercase (GraphQL/REST) to lowercase
  const { status, errorCode, type } = bulkOperation;
  Object.assign(record, {
    ...bulkOperation,
    status: status?.toLowerCase(),
    errorCode: errorCode?.toLowerCase(),
    type: type?.toLowerCase(),
    id: record.id,
  });
}

export async function globalShopifySync(params: {
  apiKeys: string[];
  syncSince: string;
  models: string[];
  force: boolean;
  startReason: string;
}) {
  const context = maybeGetActionContextFromLocalStorage();
  const effectAPIs = assert(
    context ? context.effectAPIs : getCurrentContext().effectAPIs,
    "effect apis is missing from the current context"
  );
  const api = assert(context ? context.api : getCurrentContext().api, "api client is missing from the current context");

  const { apiKeys, syncSince, models, force, startReason } = params;

  const { shopModelIdentifier, installedViaKeyFieldIdentifier, runShopSyncIdentifier, accessTokenIdentifier, forceFieldIdentifier } =
    await effectAPIs.getSyncIdentifiers();

  const pageSize = 250;
  let pageInfo: { first?: number; endCursor?: string; hasNextPage: boolean } = { first: pageSize, hasNextPage: true };
  const results: { id: string; domain: string; state: Record<string, any>; [key: string]: any }[] = [];

  if (apiKeys && apiKeys.length > 0) {
    try {
      while (pageInfo.hasNextPage) {
        const records = await api.internal[shopModelIdentifier].findMany({
          filter: {
            [installedViaKeyFieldIdentifier]: {
              in: apiKeys,
            },
            state: {
              inState: "created.installed",
            },
            planName: {
              notIn: ["frozen", "fraudulent", "cancelled"],
            },
          },
          first: pageInfo.first,
          after: pageInfo.endCursor,
        });
        results.push(...records);
        pageInfo = records.pagination.pageInfo;
      }
    } catch (error) {
      Globals.logger.info({ userVisible: true, error, apiKeys }, "could not get shops for all API keys");
      throw error;
    }

    for (const result of results) {
      // skip the sync if there is no accessToken set or if the state is uninstalled
      if (Globals.platformModules.lodash().isEmpty(result[accessTokenIdentifier]) || result.state?.created == "uninstalled") {
        Globals.logger.info({ shopId: result.id }, "skipping sync for shop without access token or is uninstalled");
        continue;
      }

      try {
        const response = await api.mutate(
          `
            mutation runSync($shopId: GadgetID!, $domain: String!, $syncSince: DateTime, $models: JSON${
              forceFieldIdentifier ? ", $force: Boolean" : ""
            }, $startReason: String) {
              ${runShopSyncIdentifier}(shopifySync:{
                domain:$domain
                syncSince:$syncSince
                models:$models
                ${forceFieldIdentifier ? `${forceFieldIdentifier}:$force` : ""}
                shop:{
                  _link:$shopId
                }
              }, startReason: $startReason) {
                success
                errors {
                  message
                }
              }
            }
          `,
          {
            shopId: result.id,
            domain: result.domain,
            syncSince,
            models,
            ...(forceFieldIdentifier ? { force } : undefined),
            startReason,
          }
        );

        // we might have some errors such as the desired models not being enabled for the connection
        if (response[runShopSyncIdentifier] && !response[runShopSyncIdentifier].success) {
          Globals.logger.warn(
            { userVisible: true, shop: result, error: response[runShopSyncIdentifier].errors },
            "couldn't start sync for shop"
          );
        }
      } catch (error) {
        // log that the sync could not be started for the shop but continue
        Globals.logger.warn({ userVisible: true, error, shop: result }, "couldn't start sync for shop");
      }
    }
  } else {
    throw new InvalidActionInputError("missing at least 1 api key");
  }
}

export function legacySetUser() {
  const context = getActionContextFromLocalStorage();

  if (!context.scope.authenticatedUser) {
    throw new UserNotSetOnSessionError(
      "The authenticated user could not be saved to the session when logging in. Make sure the user has a role assigned to them."
    );
  }
  if (!context.session) {
    throw new NoSessionForAuthenticationError(
      "Unable to authenticate because the request was made with no session in context to transition."
    );
  }
  context.session.set("user", { [LINK_PARAM]: context.scope.authenticatedUser.id });
}

export function legacyUnsetUser() {
  const context = getActionContextFromLocalStorage();

  if (!context.session) {
    throw new NoSessionForAuthenticationError("Unable to unset users on session because the request was made with no session.");
  }
  context.session.delete("user");
}

export async function legacySuccessfulAuthentication(params: AnyParams) {
  const context = getActionContextFromLocalStorage();
  const { api, scope } = context;

  const user = (await api.internal.user.findMany({ filter: { email: { equals: params.email } } }))[0];
  let result = false;
  if (user && params.password && user.password?.hash) {
    if (await Globals.platformModules.bcrypt().compare(params.password, user.password.hash)) {
      scope.authenticatedUser = user;
      result = true;
    }
  }
  Globals.logger.info({ email: params.email, userId: user?.id, result }, "login attempt");

  if (!result) {
    throw new Error("Invalid email or password");
  }
}

/**
 * Internal helper functions and variables
 */

/**
 * Get action context without `params` and `record` from async local storage.
 */
function getActionContextFromLocalStorage() {
  return assert(actionContextLocalStorage.getStore(), "this effect function should only be called from within an action");
}

/**
 * Similar to `getActionContextFromLocalStorage` but returns `undefined` if there is no action context. (i.e. possibly called from a route)
 */
function maybeGetActionContextFromLocalStorage() {
  return actionContextLocalStorage.getStore();
}

function getCurrentContext() {
  return assert(Globals.requestContext.get("requestContext"), "no gadget context found on request");
}

const LINK_PARAM = "_link";

function writableAttributes(model: ModelMetadata, record: GadgetRecord<RecordData>) {
  const fieldsByApiIdentifier = Globals.platformModules.lodash().keyBy(Object.values(model.fields) as NotYetTyped[], "apiIdentifier");
  return Globals.platformModules.lodash().pickBy(record, (v: any, k: any) => fieldsByApiIdentifier[k]?.internalWritable);
}

function changedAttributes(model: ModelMetadata, record: GadgetRecord<RecordData>) {
  const changes = record.changes();
  const attributes = Object.keys(changes).reduce((attrs, key) => {
    attrs[key] = record[key];
    return attrs;
  }, {} as any);
  return writableAttributes(model, attributes);
}

const getModelByApiIdentifier = (apiIdentifier: string): ModelMetadata => {
  const typename = modelListIndex[`api:${apiIdentifier}`];
  if (!typename) {
    throw new InternalError(`Model ${apiIdentifier} not found in available model metadata`, {
      availableApiIdentifiers: Object.keys(modelListIndex),
    });
  }

  return getModelByTypename(typename);
};

const getModelByTypename = (typename: string): ModelMetadata => {
  if (!typename) {
    throw new InternalError(`No typename found on record, __typename must be set for accessing model metadata`);
  }

  const model = modelsMap[typename];
  if (!model) {
    throw new InternalError(`Model with typename ${typename} not found in available model metadata`, {
      availableTypenames: Object.keys(modelsMap),
    });
  }

  return model;
};

export enum FieldType {
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
  RoleAssignments = "RoleAssignments",
}

const shopifyModelKey = (modelName: string) => {
  const modelKey = modelName.replaceAll(" ", "");
  return `DataModel-Shopify-${modelKey}`;
};

const ShopifyShopKey = shopifyModelKey("Shop");

const ShopifyBulkOperationGIDForId = (id: string) => `gid://shopify/BulkOperation/${id}`;
