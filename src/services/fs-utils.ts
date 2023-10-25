import fs from "fs-extra";
import path from "node:path";
import { z } from "zod";
import { createLogger } from "./log.js";

const log = createLogger("fs");

const enoentSchema = z.object({ code: z.literal("ENOENT"), path: z.string() });

export function swallowEnoent(error: unknown): void {
  try {
    const enoent = enoentSchema.parse(error);
    log.debug("swallowing enoent error", { path: path.basename(enoent.path) });
    return;
  } catch {
    throw error;
  }
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
