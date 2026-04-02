import type { CreateModelFieldsMutation } from "../../__generated__/graphql.ts";
import { EditClientError } from "../../commands/add.ts";
import { CREATE_MODEL_FIELDS_MUTATION } from "../app/edit/operation.ts";
import { ClientError } from "../app/error.ts";
import type { Context } from "../command/context.ts";
import type { FileSync } from "../filesync/filesync.ts";
import type { SyncJson } from "../filesync/sync-json.ts";
import { sprint } from "../output/sprint.ts";

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

export type AddFieldsResult = {
  fieldName: string;
  remoteFilesVersion: string;
  changed: CreateModelFieldsMutation["createModelFields"]["changed"];
};

/**
 * Parse a field target string like "model/field:type" or "model/field" into its components.
 * When the field part contains a colon, it is split into name and type.
 * When there is no colon, fieldType is undefined (valid for remove/rename).
 */
export const parseFieldTarget = (
  input: string,
): { modelApiIdentifier: string; fieldName: string; fieldType: string | undefined; problems: string[] } => {
  const lastSlashIndex = input.lastIndexOf("/");
  const problems: string[] = [];

  if (lastSlashIndex === -1 || lastSlashIndex === input.length - 1) {
    return { modelApiIdentifier: "", fieldName: "", fieldType: undefined, problems: ["Missing field definition"] };
  }

  if (lastSlashIndex === 0) {
    return { modelApiIdentifier: "", fieldName: "", fieldType: undefined, problems: ["Missing model identifier"] };
  }

  const modelApiIdentifier = input.slice(0, lastSlashIndex);
  const fieldPart = input.slice(lastSlashIndex + 1);

  // No colon means just a field name (e.g. "post/title" for remove/rename)
  if (!fieldPart.includes(":")) {
    return { modelApiIdentifier, fieldName: fieldPart, fieldType: undefined, problems: [] };
  }

  // Has colon — parse as name:type (e.g. "post/title:string" for add)
  const [modelFields, parseProblems] = parseFieldValues([fieldPart]);
  problems.push(...parseProblems);

  if (problems.length > 0 || modelFields.length === 0) {
    return { modelApiIdentifier: "", fieldName: "", fieldType: undefined, problems };
  }

  return {
    modelApiIdentifier,
    fieldName: modelFields[0]?.name ?? "",
    fieldType: modelFields[0]?.fieldType ?? "",
    problems: [],
  };
};

/**
 * Add fields to an existing model.
 */
export const addFields = async (
  ctx: Context,
  {
    syncJson,
    filesync,
    modelApiIdentifier,
    fields,
  }: {
    syncJson: SyncJson;
    filesync: FileSync;
    modelApiIdentifier: string;
    fields: Array<{ name: string; fieldType: string }>;
  },
): Promise<AddFieldsResult> => {
  let result;

  try {
    result = (
      await syncJson.edit.mutate({
        mutation: CREATE_MODEL_FIELDS_MUTATION,
        variables: {
          path: modelApiIdentifier,
          fields: fields.map((f) => ({ name: f.name, fieldType: f.fieldType })),
        },
      })
    ).createModelFields;
  } catch (error) {
    if (error instanceof ClientError) {
      throw new EditClientError(error);
    } else {
      throw error;
    }
  }

  await filesync.writeToLocalFilesystem(ctx, { filesVersion: result.remoteFilesVersion, files: result.changed, delete: [] });

  return {
    fieldName: fields[0]?.name ?? "",
    remoteFilesVersion: result.remoteFilesVersion,
    changed: result.changed,
  };
};
