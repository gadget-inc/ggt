import path from "node:path";
import { packageJsonPath } from "./package-json.js";

/**
 * The root directory of the ggt package.
 */
export const workspaceRoot = path.dirname(packageJsonPath);

/**
 * Returns an absolute path within the ggt package.
 *
 * @param segments - The segments of the path to join.
 * @returns The absolute path to the file or directory.
 */
export const workspacePath = (...segments: string[]): string => path.join(workspaceRoot, ...segments);

/**
 * Returns an absolute path within the `assets` directory of the ggt
 * package.
 *
 * @param segments - The segments of the path to join.
 * @returns The absolute path to the file or directory.
 */
export const assetsPath = (...segments: string[]): string => workspacePath("assets", ...segments);
