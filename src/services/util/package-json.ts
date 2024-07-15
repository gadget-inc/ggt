import { findUp } from "find-up";
import fs from "fs-extra";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import type { Package } from "normalize-package-data";
import normalizePackageData from "normalize-package-data";

const maybePackageJsonPath = await findUp("package.json", { cwd: fileURLToPath(import.meta.url) });
assert(maybePackageJsonPath !== undefined, "Could not find package.json for the ggt package.");

export const packageJsonPath = maybePackageJsonPath;

/**
 * The package.json of the ggt package.
 */
export const packageJson = (await fs.readJson(maybePackageJsonPath)) as Package;
normalizePackageData(packageJson, true);
