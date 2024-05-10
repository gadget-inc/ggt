import type { Command, Usage } from "../services/command/command.js";
import { packageJson } from "../services/config/package-json.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export const usage: Usage = () => sprint`
  Print this version of ggt.

  {gray Usage}
        ggt version
  
  {gray Updating ggt}
        When there is a new release of ggt, running ggt will show you a message letting you
        know that an update is available.
`;

export const command: Command = (_ctx) => {
  println(packageJson.version);
};
