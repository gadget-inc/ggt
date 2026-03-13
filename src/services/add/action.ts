import type { CreateActionMutation } from "../../__generated__/graphql.js";
import { AddClientError } from "../../commands/add.js";
import type { ModelApiIdentifier, GlobalActionApiIdentifier } from "../app/app.js";
import { CREATE_ACTION_MUTATION } from "../app/edit/operation.js";
import { ClientError } from "../app/error.js";
import type { Context } from "../command/context.js";
import type { FileSync } from "../filesync/filesync.js";
import type { SyncJson } from "../filesync/sync-json.js";
import colors from "../output/colors.js";
import { println } from "../output/print.js";
import { select } from "../output/select.js";
import { sprint } from "../output/sprint.js";
import { symbol } from "../output/symbols.js";

export type AddActionResult = {
  path: string;
  remoteFilesVersion: string;
  changed: CreateActionMutation["createAction"]["changed"];
};

/**
 * Resolve an action path, handling namespace conflicts between models and global actions.
 */
export const resolveActionPath = async (
  path: string,
  models: ModelApiIdentifier[],
  globalActions: GlobalActionApiIdentifier[],
): Promise<{ path: string; overrideContextAction?: "models" | "actions" }> => {
  const splitPath = path.split("/");
  const parsedPaths = splitPath.length > 1 ? splitPath.slice(0, splitPath.length - 1) : splitPath;
  const parsedAction = splitPath[splitPath.length - 1];

  const conflictingModel = models.find((model) => {
    const modelName = parsedPaths[parsedPaths.length - 1];
    return (
      model.apiIdentifier.toUpperCase() === modelName.toUpperCase() &&
      model.namespace?.join("/") === parsedPaths.slice(0, parsedPaths.length - 1).join("/")
    );
  });

  const conflictingActionNamespace = globalActions.find((action) => {
    return action.namespace?.join("/") === parsedPaths.join("/");
  });

  if (conflictingModel && conflictingActionNamespace) {
    const joinedParsedPaths = parsedPaths.join("/");
    const overrideContextAction = await select({
      choices: ["models", "actions"] as const,
      content: sprint`
        ${colors.header("Namespace Conflict:")} The action '${parsedAction}.js' cannot be automatically added due to a namespace conflict.

        How would you like to proceed?:
      `,
      formatChoice: (choice) => {
        switch (choice) {
          case "models": {
            return `As a Model action in ${colors.subdued(`models/${joinedParsedPaths}/${parsedAction}.js`)}`;
          }
          case "actions": {
            return `As an Action in ${colors.subdued(`actions/${joinedParsedPaths}/${parsedAction}.js`)}`;
          }
        }
      },
    });

    println({
      ensureEmptyLineAbove: true,
      content: sprint`${colors.renamed(symbol.info)} You can override the context of the action by specifying the context in the path. For example: ${colors.subdued(`ggt add action ${overrideContextAction}/${path}`)}`,
    });

    return { path: `${overrideContextAction}/${path}`, overrideContextAction };
  }

  return { path };
};

/**
 * Add an action to the app.
 */
export const addAction = async (
  ctx: Context,
  {
    syncJson,
    filesync,
    path,
  }: {
    syncJson: SyncJson;
    filesync: FileSync;
    path: string;
  },
): Promise<AddActionResult> => {
  let result;

  try {
    result = (
      await syncJson.edit.mutate({
        mutation: CREATE_ACTION_MUTATION,
        variables: { path },
      })
    ).createAction;
  } catch (error) {
    if (error instanceof ClientError) {
      throw new AddClientError(error);
    } else {
      throw error;
    }
  }

  await filesync.writeToLocalFilesystem(ctx, { filesVersion: result.remoteFilesVersion, files: result.changed, delete: [] });

  return {
    path,
    remoteFilesVersion: result.remoteFilesVersion,
    changed: result.changed,
  };
};
