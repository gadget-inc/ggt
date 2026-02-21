import type { Run } from "../services/command/command.js";

import { PUBLISH_ISSUES_QUERY } from "../services/app/edit/operation.js";
import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError, type ArgsDefinitionResult } from "../services/command/arg.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { printProblems, publishIssuesToProblems } from "../services/output/problems.js";
import { sprint } from "../services/output/sprint.js";

export const description = "Show problems found in your application";

export const hidden = true;

export const examples = ["ggt problems"] as const;

export type ProblemsArgs = typeof args;
export type ProblemsArgsResult = ArgsDefinitionResult<ProblemsArgs>;

export const args = AppIdentityArgs;

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
  const appIdentity = await AppIdentity.load(ctx, { command: "problems", args, directory });

  const { publishIssues } = await appIdentity.edit.query({ query: PUBLISH_ISSUES_QUERY });

  if (publishIssues.length === 0) {
    println({ ensureEmptyLineAbove: true, content: sprint`{green No problems found.}` });
  } else {
    println({ ensureEmptyLineAbove: true, content: sprint`{bold.yellow !} {bold Problems found in your app}` });
    printProblems({ problems: publishIssuesToProblems(publishIssues) });
  }

  await appIdentity.edit.dispose();
};
