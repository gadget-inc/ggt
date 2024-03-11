import type { Command, Usage } from "../services/command/command.js";
import { packageJson } from "../services/config/package-json.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export const usage: Usage = () => sprint`
  Print this version of ggt.

  {bold USAGE}
    ggt version

  {bold EXAMPLES}
    $ ggt version
`;

export const command: Command = (_ctx) => {
  println(packageJson.version);
};
