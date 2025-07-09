import fs from "fs-extra";
import type { Context } from "../command/context.js";
import { swallowEnoent } from "../filesync/directory.js";
import { output } from "../output/output.js";
import { println } from "../output/print.js";
import { select } from "../output/select.js";
import { config } from "./config.js";

export type DefaultsConfigData = {
  telemetry?: boolean;
  json?: boolean;
};

export const promptDefaultsConfig = async (ctx: Context): Promise<DefaultsConfigData> => {
  const path = config.defaultsConfigFile;
  let selections: DefaultsConfigData;

  const defaultSelection = await select({
    ensureEmptyLineAbove: true,
    choices: ["default", "configure"],
    content: "Default configuration from Gadget or configure manually",
  });

  if (defaultSelection === "configure") {
    const telemetrySelection = await select({
      ensureEmptyLineAbove: true,
      choices: ["enable", "disable"],
      content: "Automatically send crash reports and telemetry to Gadget",
    });

    const jsonSelection = await select({
      ensureEmptyLineAbove: true,
      choices: ["disable", "enable"],
      content: "ggt output as JSON",
    });

    selections = {
      telemetry: telemetrySelection === "enable",
      json: jsonSelection === "enable",
    };
  } else {
    /* === "default" */
    selections = {
      telemetry: true,
      json: false,
    };
  }

  await fs.outputJSON(path, selections).then(
    () => {
      println("Default arguments were saved.");
    },
    (err: unknown) => {
      ctx.log.error("failed to write config", { error: (err as Error).message });
    },
  );

  return selections;
};

export const loadDefaultsConfig = async (ctx: Context, promptIfMissing: boolean): Promise<DefaultsConfigData> => {
  const configFilePath = config.defaultsConfigFile;

  let configData: null | DefaultsConfigData;

  try {
    configData = (await fs.readJSON(configFilePath)) as DefaultsConfigData;
  } catch (error) {
    swallowEnoent(error);

    /* If there's no config defaults, and it isn't interactive, we can just move on. */
    if (output.isInteractive && promptIfMissing) {
      println("No ggt defaults were found to have been configured. Please answer the prompts to configure your defaults.");
      configData = await promptDefaultsConfig(ctx);
      println("To update these options later, see `ggt configure`.");
    } else {
      configData = {};
    }
  }

  return configData;
};

export const clearDefaultsConfig = async (ctx: Context): Promise<void> => {
  const path = config.defaultsConfigFile;
  await fs.outputJSON(path, {}).then(
    () => {
      println("Default arguments were saved.");
    },
    (err: unknown) => {
      ctx.log.error("failed to write config", { error: (err as Error).message });
    },
  );
};
