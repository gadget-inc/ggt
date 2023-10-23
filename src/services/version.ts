import boxen from "boxen";
import { isAfter } from "date-fns";
import fs from "fs-extra";
import ms from "ms";
import assert from "node:assert";
import path from "node:path";
import semver from "semver";
import { z } from "zod";
import { config } from "./config.js";
import { http } from "./http.js";
import { createLogger } from "./log.js";
import { println, sprint } from "./output.js";

const log = createLogger("version");

const UPDATE_CHECK_FREQUENCY = ms("12 hours");

export const getDistTags = async () => {
  const json = await http({
    method: "GET",
    url: "https://registry.npmjs.org/ggt",
    responseType: "json",
    resolveBodyOnly: true,
    timeout: {
      request: ms("5s"),
    },
  });

  const parsed = z
    .object({
      name: z.literal("ggt"),
      "dist-tags": z.object({
        latest: z.string(),
      }),
    })
    .parse(json);

  return parsed["dist-tags"];
};

export const shouldCheckForUpdate = async () => {
  try {
    const lastCheck = Number(await fs.readFile(path.join(config.cacheDir, "last-update-check"), "utf-8"));
    assert(!Number.isNaN(lastCheck));
    return isAfter(Date.now(), lastCheck + UPDATE_CHECK_FREQUENCY);
  } catch (error) {
    return true;
  }
};

export const warnIfUpdateAvailable = async () => {
  try {
    const shouldCheck = await shouldCheckForUpdate();
    if (!shouldCheck) {
      return;
    }

    await fs.outputFile(path.join(config.cacheDir, "last-update-check"), String(Date.now()));

    const tags = await getDistTags();

    if (semver.lt(config.version, tags.latest)) {
      log.info("update available", { current: config.version, latest: tags.latest });
      println(
        boxen(
          sprint`
            Update available! {red ${config.version}} -> {green ${tags.latest}}.
            Changelog: https://github.com/gadget-inc/ggt/releases/tag/v${tags.latest}
            Run "npm install -g ${config.name}" to update.
          `,
          {
            padding: 1,
            borderStyle: "round",
            textAlignment: "center",
          },
        ),
      );
    }
  } catch (error) {
    log.error("failed to check for updates", { error });
  }
};
