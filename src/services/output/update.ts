import boxen from "boxen";
import dayjs from "dayjs";
import fs from "fs-extra";
import ms from "ms";
import assert from "node:assert";
import path from "node:path";
import semver from "semver";
import { z } from "zod";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { http } from "../http/http.js";
import { packageJson } from "../util/package-json.js";
import { println } from "./print.js";
import { sprint } from "./sprint.js";

const UPDATE_CHECK_FREQUENCY = ms("12 hours");

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
    const lastCheck = Number(await fs.readFile(path.join(config.cacheDir, "last-update-check"), "utf8"));
    assert(!Number.isNaN(lastCheck));
    return dayjs().isAfter(lastCheck + UPDATE_CHECK_FREQUENCY);
  } catch (error) {
    ctx.log.trace("failed to check for updates", { error });
    return true;
  }
};

/**
 * Checks for updates to the `ggt` npm package and logs a warning
 * message if an update is available.
 *
 * @returns A Promise that resolves with void when the check is
 * complete.
 */
export const warnIfUpdateAvailable = async (ctx: Context): Promise<void> => {
  try {
    await fs.outputFile(path.join(config.cacheDir, "last-update-check"), String(Date.now()));

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
      println(
        boxen(updateMessage, {
          padding: 1,
          borderStyle: "round",
          textAlignment: "center",
        }),
      );
    }
  } catch (error) {
    ctx.log.error("failed to check for updates", { error });
  }
};
