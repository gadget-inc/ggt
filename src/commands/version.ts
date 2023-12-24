import type { Command, Usage } from "../services/command/command.js";
import { config } from "../services/config/config.js";
import { sprint } from "../services/output/sprint.js";

export const usage: Usage = () => sprint`
  Print the version of ggt

  {bold USAGE}
    ggt version

  {bold EXAMPLE}
    $ ggt version
      ${config.version}
`;

export const command: Command = (ctx) => {
  ctx.log.println(config.version);
};
