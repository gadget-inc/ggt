import { getApps } from "../services/app/app.js";
import type { Command, Usage } from "../services/command/command.js";
import { sprint } from "../services/output/sprint.js";
import { getUserOrLogin } from "../services/user/user.js";

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

export const command: Command = async (ctx) => {
  await getUserOrLogin(ctx);

  const apps = await getApps(ctx);
  if (apps.length === 0) {
    ctx.log.println`
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

  ctx.log.println`{bold Slug}${" ".repeat(longestSlug - 4)} {bold Domain}`;
  ctx.log.println`${"─".repeat(Math.max(longestSlug, 4))} ${"─".repeat(Math.max(longestDomain, 6))}`;
  for (const app of apps.sort((a, b) => a.slug.localeCompare(b.slug))) {
    ctx.log.println`${app.slug}${" ".repeat(longestSlug - app.slug.length)} ${app.primaryDomain}`;
  }
};
