import type { Command, Usage } from "../services/command/command.js";
import { config } from "../services/config/config.js";
import { createLogger } from "../services/output/log/logger.js";
import { sprint } from "../services/output/sprint.js";

const log = createLogger({ name: "version" });

export const usage: Usage = () => sprint`
  Print the version of ggt

  {bold USAGE}
    ggt version

  {bold EXAMPLE}
    $ ggt version
      ${config.version}
`;

export const command: Command = () => {
  log.println(config.version);
};
