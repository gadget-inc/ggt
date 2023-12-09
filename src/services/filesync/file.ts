import type { FileSyncEncoding } from "../../__generated__/graphql.js";

export type File = {
  path: string;
  oldPath?: string | null;
  mode: number;
  content: string;
  encoding: FileSyncEncoding;
};
