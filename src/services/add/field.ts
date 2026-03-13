import type { CreateModelFieldsMutation } from "../../__generated__/graphql.ts";
import { AddClientError } from "../../commands/add.ts";
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
 * Parse a field target string like "modelA/fieldB:string" into its components.
 */
export const parseFieldTarget = (
  input: string,
): { modelApiIdentifier: string; fieldName: string; fieldType: string; problems: string[] } => {
  const splitPathAndField = input.split("/");
  const problems: string[] = [];

  if (!splitPathAndField[1]) {
    return { modelApiIdentifier: "", fieldName: "", fieldType: "", problems: ["Missing field definition"] };
  }

  const [modelFields, parseProblems] = parseFieldValues([splitPathAndField[1]]);
  problems.push(...parseProblems);

  if (problems.length > 0 || modelFields.length === 0) {
    return { modelApiIdentifier: "", fieldName: "", fieldType: "", problems };
  }

  return {
    modelApiIdentifier: splitPathAndField[0],
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
      throw new AddClientError(error);
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
