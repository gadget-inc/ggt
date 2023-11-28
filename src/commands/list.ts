import { getApps } from "../services/app/app.js";
import { createLogger } from "../services/output/log/logger.js";
import { sprint } from "../services/output/sprint.js";
import { getUserOrLogin } from "../services/user/user.js";
import type { Command, Usage } from "./command.js";

const log = createLogger({ name: "list" });

export const usage: Usage = () => sprint`
    List the apps available to the currently logged in user.

    {bold USAGE}
      ggt list

    {bold EXAMPLE}
      $ ggt list
        Slug    Domain
        ─────── ──────────────────
        my-app  my-app.gadget.app
        example example.gadget.app
        test    test.gadget.app
`;

export const command: Command = async () => {
  const user = await getUserOrLogin();

  const apps = await getApps(user);
  if (apps.length === 0) {
    log.println`
        It doesn't look like you have any applications.

        Visit https://gadget.new to create one!
    `;
    return;
  }

  let longestSlug = 0;
  let longestDomain = 0;

  for (const app of apps) {
    longestSlug = Math.max(longestSlug, app.slug.length);
    longestDomain = Math.max(longestDomain, app.primaryDomain.length);
  }

  log.println`{bold Slug}${" ".repeat(longestSlug - 4)} {bold Domain}`;
  log.println`${"─".repeat(Math.max(longestSlug, 4))} ${"─".repeat(Math.max(longestDomain, 6))}`;
  for (const app of apps.sort((a, b) => a.slug.localeCompare(b.slug))) {
    log.println`${app.slug}${" ".repeat(longestSlug - app.slug.length)} ${app.primaryDomain}`;
  }
};
