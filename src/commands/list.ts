import { getApplications, parseAppListToTeamMap } from "../services/app/app.js";
import type { Run, Usage } from "../services/command/command.js";
import { output } from "../services/output/output.js";
import { println } from "../services/output/print.js";
import { sprint, sprintln } from "../services/output/sprint.js";
import { printTable } from "../services/output/table.js";
import { getUserOrLogin } from "../services/user/user.js";

export const usage: Usage = () => sprint`
    List the apps available to the currently logged-in user.

    {bold Usage}
          ggt list
`;

export const run: Run = async (ctx) => {
  await getUserOrLogin(ctx, "list");

  const apps = await getApplications(ctx);
  if (apps.length === 0) {
    println`
        It doesn't look like you have any applications.

        Visit https://gadget.new to create one!
    `;
    return;
  }

  const appTeamMap = parseAppListToTeamMap(apps);

  if (output.isInteractive) {
    appTeamMap.forEach((apps, teamName) => {
      println(sprint`{grey ${teamName}}`);
      printTable({
        json: apps,
        headers: ["Name", "Domain"],
        rows: apps.map((app) => [app.slug, app.primaryDomain]),
      });
      println("");
    });
  } else {
    let simpleOutput = "";
    for (const app of apps) {
      simpleOutput += sprintln`${app.slug}\t${app.primaryDomain}`;
    }

    println({ json: apps, content: simpleOutput });
  }
};
