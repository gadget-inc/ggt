import type { FileSyncEncoding } from "../../__generated__/graphql.ts";

export type File = {
  path: string;
  oldPath?: string | null;
  mode: number;
  content: string;
  encoding: FileSyncEncoding;
};
