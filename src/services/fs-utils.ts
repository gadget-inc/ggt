import fs from "fs-extra";
import path from "node:path";
import { breadcrumb } from "./breadcrumbs.js";

export function swallowEnoent(error: any): void {
  if (error.code === "ENOENT") {
    breadcrumb({
      type: "debug",
      category: "fs",
      message: "Swallowing ENOENT error",
      data: {
        path: path.basename(error.path as string),
      },
    });
    return;
  }
  throw error;
}

export async function isEmptyDir(dir: string, opts = { swallowEnoent: true }): Promise<boolean> {
  try {
    for await (const _ of await fs.opendir(dir, { bufferSize: 1 })) {
      return false;
    }
    return true;
  } catch (error) {
    if (opts.swallowEnoent) {
      swallowEnoent(error);
      return true;
    }
    throw error;
  }
}
