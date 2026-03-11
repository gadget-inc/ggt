import { PUBLISH_ISSUES_QUERY } from "../services/app/edit/operation.js";
import { AppIdentity, AppIdentityFlags } from "../services/command/app-identity.js";
import { defineCommand } from "../services/command/command.js";
import { FlagError } from "../services/command/flag.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import colors from "../services/output/colors.js";
import { println } from "../services/output/print.js";
import { printProblems, publishIssuesToProblems } from "../services/output/problems.js";
import { sprint } from "../services/output/sprint.js";

export default defineCommand({
  name: "problems",
  aliases: ["problem"],
  description: "Show errors and warnings in your app",
  details: sprint`
    Fetches issues that would block a deploy from the Gadget platform for your app's environment.
    Issues include type errors, missing action files, and schema conflicts. Exits
    cleanly with a success message when no problems are found.
  `,
  examples: ["ggt problems", "ggt problems --app myBlog", "ggt problems --env staging", "ggt problems --app myBlog --env production"],
  flags: AppIdentityFlags,
  run: async (ctx, flags) => {
    if (flags._.length > 0) {
      throw new FlagError(
        sprint`
          "ggt problems" does not take any positional arguments.

          If you are trying to see the problems of a specific directory,
          you must "cd" to that directory and then run "ggt problems".
        `,
      );
    }

    const directory = await loadSyncJsonDirectory(process.cwd());
    const appIdentity = await AppIdentity.load(ctx, { command: "problems", flags, directory });

    const { publishIssues } = await appIdentity.edit.query({ query: PUBLISH_ISSUES_QUERY });

    if (publishIssues.length === 0) {
      println({ ensureEmptyLineAbove: true, content: colors.success("No problems found.") });
    } else {
      println({ ensureEmptyLineAbove: true, content: `${colors.warning("!")} ${colors.header("Problems found in your app")}` });
      printProblems({ problems: publishIssuesToProblems(publishIssues) });
    }

    await appIdentity.edit.dispose();
  },
});
