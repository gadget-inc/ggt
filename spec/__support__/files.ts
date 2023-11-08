import fs from "fs-extra";
import path from "node:path";

export type Files = Record<string, string>;

export const writeDir = async (dir: string, files: Files): Promise<void> => {
  await fs.ensureDir(dir);

  for (const [filepath, content] of Object.entries(files)) {
    if (filepath.endsWith("/")) {
      await fs.ensureDir(path.join(dir, filepath));
    } else {
      await fs.outputFile(path.join(dir, filepath), content);
    }
  }
};
