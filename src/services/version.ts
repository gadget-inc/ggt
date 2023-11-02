import boxen from "boxen";
import dayjs from "dayjs";
import fs from "fs-extra";
import ms from "ms";
import assert from "node:assert";
import path from "node:path";
import semver from "semver";
import { z } from "zod";
import { config } from "./config.js";
import { http } from "./http.js";
import { createLogger } from "./log.js";
import { println, sprint } from "./print.js";

const log = createLogger("version");

const UPDATE_CHECK_FREQUENCY = ms("12 hours");

const Registry = z.object({
  name: z.literal("ggt"),
  "dist-tags": z.object({
    latest: z.string(),
  }),
});

type Registry = z.infer<typeof Registry>;

export const getDistTags = async (): Promise<Registry["dist-tags"]> => {
  const json = await http({
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

export const shouldCheckForUpdate = async (): Promise<boolean> => {
  try {
    const lastCheck = Number(await fs.readFile(path.join(config.cacheDir, "last-update-check"), "utf-8"));
    assert(!Number.isNaN(lastCheck));
    return dayjs().isAfter(lastCheck + UPDATE_CHECK_FREQUENCY);
  } catch (error) {
    return true;
  }
};

export const warnIfUpdateAvailable = async (): Promise<void> => {
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
