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
  await fs.ensureFile(path);

  println({ ensureEmptyLineAbove: true, content: "Please answer the prompts to configure ggt defaults." });

  const telemetrySelection = await select({
    ensureEmptyLineAbove: true,
    choices: ["enable", "disable"],
    content: "Would you like to automatically send crash reports and telemetry to Gadget?",
  });

  const jsonSelection = await select({
    ensureEmptyLineAbove: true,
    choices: ["disable", "enable"],
    content: "Would you like to out as json by default?",
  });

  const selections: DefaultsConfigData = {
    telemetry: telemetrySelection === "enable",
    json: jsonSelection === "enable",
  };

  fs.writeJSON(path, selections, (err) => {
    if (err) {
      ctx.log.error("failed to write config", { error: err.message });
    } else {
      println("Default arguments were saved.");
    }
  });

  return selections;
};

export const loadDefaultsConfig = async (ctx: Context): Promise<DefaultsConfigData> => {
  const configFilePath = config.defaultsConfigFile;

  let configData: null | DefaultsConfigData;

  try {
    configData = fs.readJSONSync(configFilePath) as DefaultsConfigData;
  } catch (error) {
    swallowEnoent(error);

    /* If there's no config defaults, and it isn't interactive, we can just move on. */
    if (output.isInteractive) {
      println("No ggt defaults were found to have been configured. Please answer the prompts to configure your defaults.");
      configData = await promptDefaultsConfig(ctx);
      println("To update these options later, see `ggt configure`.");
    } else {
      configData = {};
    }
  }

  return configData;
};

export const clearDefaultsConfig = (ctx: Context): void => {
  const path = config.defaultsConfigFile;
  fs.writeJSON(path, {}, (err) => {
    if (err) {
      ctx.log.error("failed to write config", { error: err.message });
    } else {
      println("Default arguments were cleared.");
    }
  });
};
