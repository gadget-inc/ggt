import type { CreateRouteMutation } from "../../__generated__/graphql.js";
import { AddClientError } from "../../commands/add.js";
import { CREATE_ROUTE_MUTATION } from "../app/edit/operation.js";
import { ClientError } from "../app/error.js";
import type { Context } from "../command/context.js";
import type { FileSync } from "../filesync/filesync.js";
import type { SyncJson } from "../filesync/sync-json.js";
import colors from "../output/colors.js";
import { println } from "../output/print.js";

export type AddRouteResult = {
  method: string;
  path: string;
  remoteFilesVersion: string;
  changed: CreateRouteMutation["createRoute"]["changed"];
};

/**
 * Add a route to the app.
 */
export const addRoute = async (
  ctx: Context,
  {
    syncJson,
    filesync,
    method,
    path,
  }: {
    syncJson: SyncJson;
    filesync: FileSync;
    method: string;
    path: string;
  },
): Promise<AddRouteResult> => {
  let result;

  try {
    result = (
      await syncJson.edit.mutate({
        mutation: CREATE_ROUTE_MUTATION,
        variables: { method, path },
      })
    ).createRoute;
  } catch (error) {
    if (error instanceof ClientError) {
      throw new AddClientError(error);
    } else {
      throw error;
    }
  }

  await filesync.writeToLocalFilesystem(ctx, { filesVersion: result.remoteFilesVersion, files: result.changed, delete: [] });

  return {
    method,
    path,
    remoteFilesVersion: result.remoteFilesVersion,
    changed: result.changed,
  };
};

/**
 * Print success message after adding a route.
 */
export const printAddRouteResult = (result: AddRouteResult): void => {
  println({ ensureEmptyLineAbove: true, content: `Route ${colors.code(result.path)} added successfully.` });
};
