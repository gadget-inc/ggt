import { getApplications, groupByTeam } from "../services/app/app.js";
import { defineCommand } from "../services/command/command.js";
import colors from "../services/output/colors.js";
import { output } from "../services/output/output.js";
import { println } from "../services/output/print.js";
import { sprint, sprintln } from "../services/output/sprint.js";
import { printTable } from "../services/output/table.js";
import { getUserOrLogin } from "../services/user/user.js";

export default defineCommand({
  name: "list",
  description: "List your Gadget apps",
  details: sprint`
    Fetches all apps accessible to the authenticated user. In interactive mode,
    apps are grouped by team and displayed as a table. In non-interactive mode,
    outputs tab-separated slug and domain pairs suitable for scripting.
  `,
  examples: ["ggt list", "ggt list --json"],
  run: async (ctx) => {
    await getUserOrLogin(ctx, "list");

    const availableApps = await getApplications(ctx);
    if (availableApps.length === 0) {
      println`
        It doesn't look like you have any applications.

        Visit https://gadget.new to create one!
    `;
      return;
    }

    if (output.isInteractive) {
      for (const [teamName, apps] of groupByTeam(availableApps)) {
        println(colors.subdued(teamName));
        printTable({
          json: apps,
          headers: ["Name", "Domain"],
          rows: apps.map((app) => [app.slug, app.primaryDomain]),
        });
        println("");
      }
    } else {
      let simpleOutput = "";
      for (const app of availableApps) {
        simpleOutput += sprintln`${app.slug}\t${app.primaryDomain}`;
      }

      println({ json: availableApps, content: simpleOutput });
    }
  },
});
