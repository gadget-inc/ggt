import type { Run, SubcommandDef } from "../services/command/command.js";

import { renderDetailedUsage } from "../services/command/usage.js";
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

export const description = "Configure default execution options";

export const examples = ["ggt configure show", "ggt configure change", "ggt configure clear"] as const;

export const subcommandDefs: readonly SubcommandDef[] = [
  { name: "show", description: "Show current configuration" },
  { name: "change", description: "Change configuration options" },
  { name: "clear", description: "Clear all configured defaults" },
];

export const longDescription = sprint`
  Make changes to the configured defaults. This allows you to set an option on every ggt command by default without
  needing to set a flag on every command.
`;

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
    default: {
      const mod = await import("./configure.js");
      println(renderDetailedUsage("configure", mod));
      return;
    }
  }
};
