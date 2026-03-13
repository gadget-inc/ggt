import type { CreateModelMutation } from "../../__generated__/graphql.js";
import { AddClientError } from "../../commands/add.js";
import { CREATE_MODEL_MUTATION } from "../app/edit/operation.js";
import { ClientError } from "../app/error.js";
import type { Context } from "../command/context.js";
import type { FileSync } from "../filesync/filesync.js";
import type { SyncJson } from "../filesync/sync-json.js";

export type AddModelResult = {
  modelApiIdentifier: string;
  remoteFilesVersion: string;
  changed: CreateModelMutation["createModel"]["changed"];
};

/**
 * Add a model to the app.
 */
export const addModel = async (
  ctx: Context,
  {
    syncJson,
    filesync,
    modelApiIdentifier,
    fields = [],
  }: {
    syncJson: SyncJson;
    filesync: FileSync;
    modelApiIdentifier: string;
    fields?: Array<{ name: string; fieldType: string }>;
  },
): Promise<AddModelResult> => {
  let result;

  try {
    result = (
      await syncJson.edit.mutate({
        mutation: CREATE_MODEL_MUTATION,
        variables: {
          path: modelApiIdentifier,
          fields: fields.map((f) => ({ name: f.name, fieldType: f.fieldType })),
        },
      })
    ).createModel;
  } catch (error) {
    if (error instanceof ClientError) {
      throw new AddClientError(error);
    } else {
      throw error;
    }
  }

  await filesync.writeToLocalFilesystem(ctx, { filesVersion: result.remoteFilesVersion, files: result.changed, delete: [] });

  return {
    modelApiIdentifier,
    remoteFilesVersion: result.remoteFilesVersion,
    changed: result.changed,
  };
};
