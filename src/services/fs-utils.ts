import fs from "fs-extra";
import path from "node:path";
import { createLogger } from "./log.js";

const log = createLogger("fs");

export function swallowEnoent(error: any): void {
  if (error.code === "ENOENT") {
    log.debug("swallowing enoent error", { path: path.basename(error.path as string) });
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
