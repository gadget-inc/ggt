import { getApps } from "../services/app/app.js";
import { println, sprint } from "../services/print.js";
import { getUserOrLogin } from "../services/user.js";
import type { Command } from "./index.js";

export const usage = sprint`
    List the apps available to the currently logged in user.

    {bold USAGE}
      $ ggt list

    {bold EXAMPLE}
      {gray $ ggt list}
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
    println`
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

  println`{bold Slug}${" ".repeat(longestSlug - 4)} {bold Domain}`;
  println`${"─".repeat(Math.max(longestSlug, 4))} ${"─".repeat(Math.max(longestDomain, 6))}`;
  for (const app of apps.sort((a, b) => a.slug.localeCompare(b.slug))) {
    println`${app.slug}${" ".repeat(longestSlug - app.slug.length)} ${app.primaryDomain}`;
  }
};
