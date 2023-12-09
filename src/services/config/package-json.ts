import fs from "fs-extra";
import type { Package } from "normalize-package-data";
import normalizePackageData from "normalize-package-data";
import { workspacePath } from "../util/paths.js";

/**
 * The package.json of the ggt package.
 */
export const packageJson = (await fs.readJson(workspacePath("package.json"))) as Package;

normalizePackageData(packageJson, true);
