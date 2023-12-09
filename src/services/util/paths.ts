import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Returns the filename of the current module.
 *
 * @returns {string} The filename of the current module.
 */
export const thisFilename = (): string => fileURLToPath(import.meta.url);

/**
 * Returns the directory name of the current module.
 *
 * @returns {string} The directory name of the current module.
 */
export const thisDirname = (): string => path.dirname(thisFilename());

/**
 * Returns a path relative to the current module.
 *
 * @param {string[]} segments The segments of the path.
 * @returns {string} The path relative to the current module.
 */
export const relativeToThisFile = (...segments: string[]): string => path.join(thisDirname(), ...segments);

/**
 * The root directory of the ggt package.
 */
export const workspaceRoot = relativeToThisFile("../../../");

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
