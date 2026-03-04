import { defineCommand } from "../services/command/command.js";
import { clearDefaultsConfig, type DefaultsConfigData, loadDefaultsConfig, promptDefaultsConfig } from "../services/config/defaults.js";
import colors from "../services/output/colors.js";
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

export default defineCommand({
  name: "configure",
  description: "Manage ggt configuration",
  details: sprint`
    Options like ${colors.identifier("--telemetry")} and ${colors.identifier("--json")} can be persisted so they apply to every
    ggt command without being passed explicitly each time. The configuration is stored
    locally and can be cleared at any time.
  `,
  examples: ["ggt configure show", "ggt configure change", "ggt configure clear"],
  subcommands: (sub) => ({
    show: sub({
      description: "Show current configured defaults",
      details: sprint`
        Prints the current configuration as a table, showing the configured value
        for each supported option. Options without a configured value are omitted.
      `,
      examples: ["ggt configure show"],
      run: async (ctx) => {
        printDefaultsConfig(await loadDefaultsConfig(ctx, false));
      },
    }),
    change: sub({
      description: "Interactively change configuration options",
      details: sprint`
        Walks through each configurable option and lets you pick a new value.
        Changes take effect for all subsequent ggt commands.
      `,
      examples: ["ggt configure change"],
      run: async (ctx) => {
        await promptDefaultsConfig(ctx);
      },
    }),
    clear: sub({
      description: "Remove all configured defaults",
      details: sprint`
        Removes all persisted options, restoring ggt to its default behavior. This
        does not affect environment variables or login sessions.
      `,
      examples: ["ggt configure clear"],
      run: async (ctx) => {
        await clearDefaultsConfig(ctx);
      },
    }),
  }),
});
