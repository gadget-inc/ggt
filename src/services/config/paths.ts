import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

/**
 * The root directory of the ggt package.
 */
export const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../");

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

/**
 * Returns an absolute path within the {@linkcode config.configDir}
 * directory.
 *
 * @param segments - The segments of the path to join.
 * @returns The absolute path to the file or directory.
 */
export const configPath = (...segments: string[]): string => path.join(config.configDir, ...segments);

/**
 * Returns an absolute path within the {@linkcode config.homeDir}
 * directory.
 *
 * @param segments - The segments of the path to join.
 * @returns The absolute path to the file or directory.
 */
export const homePath = (...segments: string[]): string => path.join(config.homeDir, ...segments);
