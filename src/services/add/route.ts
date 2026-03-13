import type { CreateRouteMutation } from "../../__generated__/graphql.ts";
import { AddClientError } from "../../commands/add.ts";
import { CREATE_ROUTE_MUTATION } from "../app/edit/operation.ts";
import { ClientError } from "../app/error.ts";
import type { Context } from "../command/context.ts";
import type { FileSync } from "../filesync/filesync.ts";
import type { SyncJson } from "../filesync/sync-json.ts";

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
