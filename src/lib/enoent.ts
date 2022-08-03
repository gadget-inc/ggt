import { logger } from "./logger";

export function ignoreEnoent(error: any): void {
  if (error.code === "ENOENT") {
    logger.trace({ path: error.path }, "ignoring ENOENT error");
    return;
  }
  throw error;
}
