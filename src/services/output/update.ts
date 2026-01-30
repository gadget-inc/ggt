import boxen from "boxen";
import dayjs from "dayjs";
import fs from "fs-extra";
import ms from "ms";
import assert from "node:assert";
import path from "node:path";
import semver from "semver";
import { z } from "zod";
import { fetchLatestAgentPluginTag, maybeLoadAgentPluginProject } from "../../commands/agent-plugin.js";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { http } from "../http/http.js";
import { packageJson } from "../util/package-json.js";
import { println } from "./print.js";
import { sprint } from "./sprint.js";

const UPDATE_CHECK_FREQUENCY = ms("12 hours");
const CLI_UPDATE_CHECK_FILE = "last-update-check";
const AGENT_PLUGIN_UPDATE_CHECK_FILE = "last-agent-plugin-update-check";

const Registry = z.object({
  name: z.literal("ggt"),
  "dist-tags": z.object({
    latest: z.string(),
    experimental: z.string(),
  }),
});

type Registry = z.infer<typeof Registry>;

export const getDistTags = async (ctx: Context): Promise<Registry["dist-tags"]> => {
  const json = await http({
    context: { ctx },
    method: "GET",
    url: "https://registry.npmjs.org/ggt",
    responseType: "json",
    resolveBodyOnly: true,
    timeout: {
      request: ms("5s"),
    },
  });

  return Registry.parse(json)["dist-tags"];
};

export const shouldCheckForUpdate = async (ctx: Context): Promise<boolean> => {
  try {
    const lastCheck = Number(await fs.readFile(path.join(config.cacheDir, CLI_UPDATE_CHECK_FILE), "utf8"));
    assert(!Number.isNaN(lastCheck));
    return dayjs().isAfter(lastCheck + UPDATE_CHECK_FREQUENCY);
  } catch (error) {
    ctx.log.trace("failed to check for updates", { error });
    return true;
  }
};

export const shouldCheckForAgentPluginUpdate = async (ctx: Context): Promise<boolean> => {
  try {
    const lastCheck = Number(await fs.readFile(path.join(config.cacheDir, AGENT_PLUGIN_UPDATE_CHECK_FILE), "utf8"));
    assert(!Number.isNaN(lastCheck));
    return dayjs().isAfter(lastCheck + UPDATE_CHECK_FREQUENCY);
  } catch (error) {
    ctx.log.trace("failed to check for agent plugin updates", { error });
    return true;
  }
};

export const printUpdateWarnings = (messages: string[]): void => {
  if (messages.length === 0) {
    return;
  }

  println(
    boxen(messages.join("\n\n"), {
      padding: 1,
      borderStyle: "round",
      textAlignment: "center",
    }),
  );
};

/**
 * Checks for updates to the `ggt` npm package.
 */
export const warnIfUpdateAvailable = async (ctx: Context): Promise<string | undefined> => {
  try {
    await fs.outputFile(path.join(config.cacheDir, CLI_UPDATE_CHECK_FILE), String(Date.now()));

    const tags = await getDistTags(ctx);

    let latest: string;
    let updateAvailable: boolean;
    let updateMessage: string;

    if (packageJson.version.includes("experimental")) {
      // this is an experimental release
      latest = tags.experimental;
      updateAvailable = packageJson.version !== latest;
      updateMessage = sprint`
        Update available! {red ${packageJson.version}} → {green ${latest}}
        Run "npm install -g ${packageJson.name}@experimental" to update.
      `;
    } else {
      // this is a stable release
      latest = tags.latest;
      updateAvailable = semver.lt(packageJson.version, latest);
      updateMessage = sprint`
        Update available! {red ${packageJson.version}} → {green ${latest}}
        Changelog: https://github.com/gadget-inc/ggt/releases/tag/v${latest}
        Run "npm install -g ${packageJson.name}" to update.
      `;
    }

    if (updateAvailable) {
      ctx.log.info("update available", { current: packageJson.version, latest });
      return updateMessage;
    }
  } catch (error) {
    ctx.log.error("failed to check for updates", { error });
  }

  return undefined;
};

export const warnIfAgentPluginUpdateAvailable = async (ctx: Context): Promise<string | undefined> => {
  try {
    const project = await maybeLoadAgentPluginProject(ctx);
    const installedVersion = project?.state.agentPlugin?.version;
    if (!installedVersion) {
      return undefined;
    }

    await fs.outputFile(path.join(config.cacheDir, AGENT_PLUGIN_UPDATE_CHECK_FILE), String(Date.now()));

    const latest = await fetchLatestAgentPluginTag(ctx);
    if (latest !== installedVersion) {
      return sprint`
        Agent plugins update available! {red ${installedVersion}} → {green ${latest}}
        Run "ggt agent-plugin update" to update.
      `;
    }
  } catch (error) {
    ctx.log.error("failed to check for agent plugin updates", { error });
  }

  return undefined;
};
