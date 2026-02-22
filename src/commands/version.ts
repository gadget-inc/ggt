import type { Run } from "../services/command/command.js";

import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { packageJson } from "../services/util/package-json.js";

export const description = "Print this version of ggt";

export const examples = ["ggt version"] as const;

export const sections = [
  {
    title: "Updating ggt",
    content: sprint`
      When there is a new release of ggt, running ggt will show you a message letting you
      know that an update is available.
    `,
  },
] as const;

export const run: Run = (_ctx) => {
  println(packageJson.version);
};
