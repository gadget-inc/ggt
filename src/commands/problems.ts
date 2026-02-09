import { PUBLISH_ISSUES_QUERY } from "../services/app/edit/operation.js";
import { ArgError, type ArgsDefinitionResult } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { printProblems, publishIssuesToProblems } from "../services/output/problems.js";
import { sprint } from "../services/output/sprint.js";

export type ProblemsArgs = typeof args;
export type ProblemsArgsResult = ArgsDefinitionResult<ProblemsArgs>;

export const args = SyncJsonArgs;

export const usage: Usage = () => {
  return sprint`
    Shows any problems (errors, warnings) found in your Gadget application.

    {gray Usage}
          ggt problems
  `;
};

export const run: Run<ProblemsArgs> = async (ctx, args) => {
  if (args._.length > 0) {
    throw new ArgError(sprint`
      "ggt problems" does not take any positional arguments.

      If you are trying to see the problems of a specific directory,
      you must "cd" to that directory and then run "ggt problems".

      Run "ggt problems -h" for more information.
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { command: "problems", args, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError({ command: "problems", args, directory });
  }

  const { publishIssues } = await syncJson.edit.query({ query: PUBLISH_ISSUES_QUERY });

  if (publishIssues.length === 0) {
    println({ ensureEmptyLineAbove: true, content: sprint`{green No problems found.}` });
  } else {
    println({ ensureEmptyLineAbove: true, content: sprint`{bold.yellow !} {bold Problems found in your app}` });
    printProblems({ problems: publishIssuesToProblems(publishIssues) });
  }

  await syncJson.edit.dispose();
};
