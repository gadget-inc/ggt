import chalk from "chalk";
import indentString from "indent-string";
import assert from "node:assert";
import terminalLink from "terminal-link";
import { PUBLISH_STATUS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import { type Run, type Usage } from "../services/command/command.js";
import { env } from "../services/config/env.js";
import { deletedSymbol, updatedSymbol } from "../services/filesync/changes.js";
import { DeployDisallowedError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { confirm } from "../services/output/confirm.js";
import { output } from "../services/output/output.js";
import { println } from "../services/output/print.js";
import { ProblemSeverity, printProblems, publishIssuesToProblems } from "../services/output/problems.js";
import { UnexpectedError, reportErrorAndExit } from "../services/output/report.js";
import { spin, type spinner } from "../services/output/spinner.js";
import { sprint } from "../services/output/sprint.js";
import { ts } from "../services/output/timestamp.js";
import { unreachable } from "../services/util/assert.js";
import { isGraphQLErrors } from "../services/util/is.js";
import { args as PushArgs } from "./push.js";

export type DeployArgs = typeof args;

export const args = {
  ...PushArgs,
  "--env": { type: String, alias: ["-e", "--environment", "--from"] },
  "--allow-problems": { type: Boolean, alias: "--allow-issues" },
  "--allow-charges": { type: Boolean },
  "--allow-data-delete": { type: Boolean },
};

export const usage: Usage = (_ctx) => {
  return sprint`
  Deploys your app to production.

  This command first performs a sync to ensure that your local and environment directories
  match, changes are tracked since last sync. If any conflicts are detected, they must be
  resolved before deployment.

  {gray Usage}
        $ ggt deploy [options]

  {gray Options}
        -a, --app <app_name>           Selects a specific app to deploy. Default set on ".gadget/sync.json"
        --from, -e, --env <env_name>   Selects a specific environment to sync and deploy from. Default set on ".gadget/sync.json"
        --force                        Deploys by discarding any changes made to the environment directory since last sync
        --allow-different-directory    Deploys from any local directory with existing files, even if the ".gadget/sync.json" file is missing
        --allow-different-app          Deploys a different app using the --app command, instead of the one specified in the “.gadget/sync.json” file
        --allow-problems               Deploys despite any existing issues found in the app (gelly errors, typescript errors etc.)
        --allow-data-delete            Deploys even if it results in the deletion of data in production
        --allow-charges                Deploys even if it results in additional charges to your plan

  {gray Examples}
        Deploys code from the staging environment of a myBlog
        {cyanBright $ ggt deploy -a myBlog -from staging}
`;
};

export const run: Run<DeployArgs> = async (ctx, args) => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.loadOrInit(ctx, { command: "deploy", args, directory });

  println({
    ensureEmptyLineAbove: true,
    content: `Deploying ${syncJson.environment.name} to ${terminalLink(syncJson.environment.application.primaryDomain, `https://${syncJson.environment.application.primaryDomain}/`)}`,
  });

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);
  if (!hashes.inSync && (hashes.localChangesToPush.size > 0 || !hashes.onlyDotGadgetFilesChanged)) {
    // the following is true:
    //   1. our local files don't match our environment's files
    //   2. we have local changes to push or non .gadget/ files have changed on our environment
    //  therefor, we need to push before we can deploy
    await filesync.print(ctx, { hashes });

    if (!args["--force"]) {
      // they didn't pass --force, so we need to ask them if they want to push
      println({
        ensureEmptyLineAbove: true,
        content: "Your environment's files must match your local files before you can deploy.",
      });

      if (output.isInteractive || env.testLike) {
        // we're interactive, so ask them what they want to do
        let content: string;
        // eslint-disable-next-line max-depth
        switch (true) {
          case hashes.bothChanged:
            content = sprint`Would you like to push your local changes and {underline discard your environment's} changes now?`;
            break;
          case hashes.localChangesToPush.size > 0:
            content = sprint`Would you like to push your local changes now?`;
            break;
          case hashes.environmentChanges.size > 0:
            content = sprint`Do you want to {underline discard your environment's} changes now?`;
            break;
          default:
            unreachable("no changes to push or discard");
        }

        await confirm(content);
      } else {
        // we're not interactive, so we're likely in a CI/CD environment
        // assume they want to push
        println({
          ensureEmptyLineAbove: true,
          content: "Assuming you want to push your local files now.",
        });
      }
    }

    await filesync.push(ctx, { command: "deploy", hashes });
  }

  const variables = {
    localFilesVersion: String(syncJson.filesVersion),
    force: args["--allow-problems"],
    allowDeletedData: args["--allow-data-delete"],
    allowCharges: args["--allow-charges"],
  };

  let spinner: spinner | undefined;
  let currentStep: AppDeploymentSteps = AppDeploymentSteps.NOT_STARTED;
  let printedProblems = false;

  const subscription = syncJson.edit.subscribe({
    subscription: PUBLISH_STATUS_SUBSCRIPTION,
    variables,
    onError: async (error) => {
      ctx.log.error("failed to deploy", { error });
      spinner?.fail(stepToSpinnerStart(syncJson, currentStep) + " " + ts());

      if (isGraphQLErrors(error.cause)) {
        const graphqlError = error.cause[0];
        assert(graphqlError, "expected graphqlError to be defined");

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- TODO: extensions is typed as never undefined, but it can be.
        if (graphqlError.extensions) {
          switch (true) {
            case graphqlError.extensions["requiresUpgrade"]:
              println({ ensureEmptyLineAbove: true, content: graphqlError.message.replace(/GGT_PAYMENT_REQUIRED:?\s*/, "") });
              process.exit(1);
              break;
            case graphqlError.extensions["requiresAdditionalCharge"]:
              println({ ensureEmptyLineAbove: true, content: graphqlError.message.replace(/GGT_PAYMENT_REQUIRED:?\s*/, "") });
              await confirm({ ensureEmptyLineAbove: true, content: "Do you want to continue?" });
              subscription.resubscribe({ ...variables, allowCharges: true });
              return;
          }
        }
      }

      await reportErrorAndExit(ctx, error);
    },
    onData: async ({ publishStatus }): Promise<void> => {
      if (!publishStatus) {
        ctx.log.warn("received empty publish status");
        return;
      }

      const { publishStarted, progress: step, issues, status, deletedModelsAndFields } = publishStatus;
      const hasIssues = issues.length > 0;

      const { deletedModels, deletedModelFields } = deletedModelsAndFields ?? { deletedModels: [], deletedModelFields: [] };
      const hasDataLoss = deletedModels.length > 0 || deletedModelFields.length > 0;

      if (!printedProblems && (hasIssues || hasDataLoss)) {
        printedProblems = true;

        const fatalIssues = issues.filter((issue) => issue.severity === ProblemSeverity.Fatal);
        if (fatalIssues.length > 0) {
          await reportErrorAndExit(ctx, new DeployDisallowedError(publishIssuesToProblems(fatalIssues)));
        }

        if (hasIssues) {
          println({ ensureEmptyLineAbove: true, content: sprint`{bold.yellow !} {bold Issues found in your development app}` });
          printProblems({ problems: publishIssuesToProblems(issues) });
        }

        if (hasDataLoss) {
          println({
            ensureEmptyLineAbove: true,
            content: sprint`{bold.yellow !} {bold Data deleted on deploy}`,
          });

          const updated = chalk.blueBright("updated");
          const deleted = chalk.redBright("deleted");

          const rows: { symbol: string; name: string; action: string; indent: number }[] = [];

          deletedModels.forEach((model: string) => {
            rows.push({ symbol: deletedSymbol, name: chalk.redBright(model), action: deleted, indent: 0 });
          });

          deletedModelFields.forEach(({ modelIdentifier, fields }) => {
            rows.push({ symbol: updatedSymbol, name: chalk.blueBright(modelIdentifier), action: updated, indent: 0 });
            fields.forEach((field) => {
              rows.push({ symbol: deletedSymbol, name: chalk.redBright(field), action: deleted, indent: 2 });
            });
          });

          const longestNameLength = rows.reduce((longest, row) => Math.max(longest, row.name.length), 0);
          const longestIndent = rows.reduce((longest, row) => Math.max(longest, row.indent), 0);
          const indentSize = 2;

          println({
            ensureEmptyLineAbove: true,
            content: chalk.gray("These changes will be applied to production based on the app you're deploying."),
          });
          for (const row of rows) {
            const indentation = " ".repeat(row.indent * indentSize);
            const namePadding = " ".repeat(longestNameLength - row.name.length + 2);
            const actionPadding = " ".repeat((longestIndent - row.indent) * indentSize);
            println({
              ensureEmptyLineAbove: false,
              content: indentString(`${indentation}${row.symbol} ${row.name}${namePadding}${actionPadding}${row.action}`, 6),
            });
          }
        }

        if (!publishStarted) {
          await confirm("Do you want to continue?");
          subscription.resubscribe({ ...variables, force: true, allowDeletedData: true });
        } else {
          const allowDataDelete = args["--allow-data-delete"];
          const allowProblems = args["--allow-problems"];

          if (!allowDataDelete && !allowProblems) {
            throw new UnexpectedError("expected --allow-data-delete or --allow-problems to be true");
          }

          if (allowProblems) {
            println(sprint`Deploying regardless of problems because "${chalk.gray("--allow-problems")}" was passed.`);
          }

          if (allowDataDelete) {
            println(sprint`Deploying regardless of deleted data because "${chalk.gray("--allow-data-delete")}" was passed.`);
          }
        }

        return;
      }

      if (status?.code === "Errored") {
        spinner?.fail(stepToSpinnerStart(syncJson, currentStep) + " " + ts());

        if (status.message) {
          println({ ensureEmptyLineAbove: true, content: chalk.red(status.message) });
        }
        if (status.output) {
          println({ ensureEmptyLineAbove: true, content: sprint`${terminalLink("Check logs", status.output)}` });
        }
        return;
      }

      if (step === AppDeploymentSteps.COMPLETED) {
        spinner?.succeed(stepToSpinnerEnd(syncJson, currentStep));

        let content = chalk.green("Deploy successful!");
        if (status?.output) {
          content += ` ${terminalLink("Check logs", status.output)}.`;
        }

        println({ ensureEmptyLineAbove: true, content });
        return;
      }

      if (step !== currentStep) {
        const spinnerText = stepToSpinnerStart(syncJson, step);
        if (spinnerText !== spinner?.text) {
          // stop the current spinner, if any, and start a new one
          spinner?.succeed(stepToSpinnerEnd(syncJson, currentStep));

          const ensureEmptyLineAbove = currentStep === AppDeploymentSteps.NOT_STARTED || !output.isInteractive;
          spinner = spin({ ensureEmptyLineAbove, content: spinnerText });
        }

        currentStep = step as AppDeploymentSteps;
      }
    },
    onComplete: () => {
      subscription.unsubscribe();
    },
  });
};

export const AppDeploymentSteps = Object.freeze({
  NOT_STARTED: "NOT_STARTED",
  STARTING: "STARTING",
  BUILDING_ASSETS: "BUILDING_ASSETS",
  UPLOADING_ASSETS: "UPLOADING_ASSETS",
  CONVERGING_STORAGE: "CONVERGING_STORAGE",
  PUBLISHING_TREE: "PUBLISHING_TREE",
  RELOADING_SANDBOX: "RELOADING_SANDBOX",
  COMPLETED: "COMPLETED",
});

export type AppDeploymentSteps = (typeof AppDeploymentSteps)[keyof typeof AppDeploymentSteps];

export const stepToSpinnerStart = (syncJson: SyncJson, step: string): string => {
  switch (step) {
    case AppDeploymentSteps.NOT_STARTED:
    case AppDeploymentSteps.STARTING:
    case AppDeploymentSteps.BUILDING_ASSETS:
    case AppDeploymentSteps.UPLOADING_ASSETS:
      return "Building frontend assets.";
    case AppDeploymentSteps.CONVERGING_STORAGE:
      return "Setting up database.";
    case AppDeploymentSteps.PUBLISHING_TREE:
      return `Copying ${syncJson.environment.name}.`;
    case AppDeploymentSteps.RELOADING_SANDBOX:
      return "Restarting app.";
    case AppDeploymentSteps.COMPLETED:
      return "Deploy complete!";
    default:
      return "Unknown step.";
  }
};

export const stepToSpinnerEnd = (syncJson: SyncJson, step: string): string => {
  switch (step) {
    case AppDeploymentSteps.NOT_STARTED:
    case AppDeploymentSteps.STARTING:
    case AppDeploymentSteps.BUILDING_ASSETS:
    case AppDeploymentSteps.UPLOADING_ASSETS:
      return `Built frontend assets. ${ts()}`;
    case AppDeploymentSteps.CONVERGING_STORAGE:
      return `Setup database. ${ts()}`;
    case AppDeploymentSteps.PUBLISHING_TREE:
      return `Copied ${syncJson.environment.name}. ${ts()}`;
    case AppDeploymentSteps.RELOADING_SANDBOX:
      return `Restarted app. ${ts()}`;
    case AppDeploymentSteps.COMPLETED:
      return "Deploy successful!";
    default:
      return `Completed unknown step. ${ts()}`;
  }
};
