import _ from "lodash";
import { getApps } from "../services/app.js";
import { println, sprint } from "../services/output.js";
import { getUserOrLogin } from "../services/user.js";

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

export const run = async () => {
  const user = await getUserOrLogin();

  const apps = await getApps(user);
  if (!apps.length) {
    println`
        It doesn't look like you have any applications.

        Visit https://gadget.new to create one!
    `;
    return;
  }

  const longestSlug = _.maxBy(apps, "slug.length")?.slug.length ?? 0;
  const longestDomain = _.maxBy(apps, "primaryDomain.length")?.primaryDomain.length ?? 0;

  println`{bold Slug}${_.repeat(" ", longestSlug - 4)} {bold Domain}`;
  println`${_.repeat("─", Math.max(longestSlug, 4))} ${_.repeat("─", Math.max(longestDomain, 6))}`;
  for (const app of _.sortBy(apps, "slug")) {
    println`${app.slug}${_.repeat(" ", longestSlug - app.slug.length)} ${app.primaryDomain}`;
  }
};
