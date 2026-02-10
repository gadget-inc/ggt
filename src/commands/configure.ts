import type { Run, Usage } from "../services/command/command.js";

import { clearDefaultsConfig, type DefaultsConfigData, loadDefaultsConfig, promptDefaultsConfig } from "../services/config/defaults.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { printTable } from "../services/output/table.js";

const printDefaultsConfig = (defaults: DefaultsConfigData): void => {
  printTable({
    json: defaults,
    headers: ["Option", "Configured Value"],
    rows: [
      ["telemetry", String(defaults.telemetry)],
      ["json", String(defaults.json)],
    ],
    borders: "thick",
  });
};

export const usage: Usage = (_ctx) => {
  return sprint`
  Make changes to the configured defaults. This allows you to set an option on every ggt command by default without
  needing to set a flag on every command.

  {gray Usage}
    ggt configure show
  
    ggt configure change
  
    ggt configure clear
  `;
};

export const run: Run = async (ctx, args): Promise<void> => {
  switch (args._[0]) {
    case "show":
      printDefaultsConfig(await loadDefaultsConfig(ctx, false));
      break;
    case "change":
      await promptDefaultsConfig(ctx);
      break;
    case "clear":
      await clearDefaultsConfig(ctx);
      break;
    default:
      println(usage(ctx));
      return;
  }
};
