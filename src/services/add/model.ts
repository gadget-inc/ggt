import terminalLink from "terminal-link";

import { AddClientError } from "../../commands/add.js";
import { CREATE_MODEL_MUTATION } from "../app/edit/operation.js";
import { ClientError } from "../app/error.js";
import type { Context } from "../command/context.js";
import type { FileSync } from "../filesync/filesync.js";
import type { SyncJson } from "../filesync/sync-json.js";
import colors from "../output/colors.js";
import { println } from "../output/print.js";
import { sprint } from "../output/sprint.js";
import { symbol } from "../output/symbols.js";

/**
 * Parse field definitions like "name:string" into { name, fieldType } objects.
 */
export const parseFieldValues = (fields: string[]): [{ name: string; fieldType: string }[], problems: string[]] => {
  const problems: string[] = [];
  const modelFields: { name: string; fieldType: string }[] = [];

  for (const field of fields) {
    const matches = /^(.*):+(.*)$/.exec(field);
    if (!matches || matches.length !== 3 || !matches[1] || !matches[2]) {
      problems.push(sprint`${field} is not a valid field definition`);
    } else {
      modelFields.push({ name: matches[1].replace(/:+/g, ""), fieldType: matches[2] });
    }
  }

  return [modelFields, problems];
};

import type { CreateModelMutation } from "../../__generated__/graphql.js";

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

/**
 * Print success message after adding a model.
 */
export const printAddModelResult = (result: AddModelResult, syncJson: SyncJson): void => {
  const modelPrintout = terminalLink.isSupported
    ? terminalLink(
        result.modelApiIdentifier,
        `https://${syncJson.environment.application.primaryDomain}/edit/${syncJson.environment.name}/model/${result.modelApiIdentifier}/schema`,
      )
    : result.modelApiIdentifier;

  println({ ensureEmptyLineAbove: true, content: colors.subdued("New model created in environment.") });
  println({
    ensureEmptyLineAbove: true,
    content: `${colors.created(symbol.tick)} Model ${colors.code(modelPrintout)} added successfully.`,
  });
};
