import type { Command, Usage } from "../services/command/command.js";
import { config } from "../services/config/config.js";
import { println, sprint } from "../services/output/print.js";

export const usage: Usage = () => sprint`
  Print this version of ggt.

  {bold USAGE}
    ggt version

  {bold EXAMPLES}
    $ ggt version
`;

export const command: Command = (_ctx) => {
  println(config.version);
};
