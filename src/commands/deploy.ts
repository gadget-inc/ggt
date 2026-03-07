import assert from "node:assert";

import indentString from "indent-string";
import terminalLink from "terminal-link";

import { completeEnvironment } from "../services/app/app.js";
import { PUBLISH_STATUS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import { defineCommand } from "../services/command/command.js";
import { env } from "../services/config/env.js";
import { deletedSymbol, updatedSymbol } from "../services/filesync/changes.js";
import { DeployDisallowedError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import colors from "../services/output/colors.js";
import { confirm } from "../services/output/confirm.js";
import { output } from "../services/output/output.js";
import { println } from "../services/output/print.js";
import { ProblemSeverity, printProblems, publishIssuesToProblems } from "../services/output/problems.js";
import { UnexpectedError, reportErrorAndExit } from "../services/output/report.js";
import { spin, type spinner } from "../services/output/spinner.js";
import { sprint } from "../services/output/sprint.js";
import { ts } from "../services/output/timestamp.js";
import { unreachable } from "../services/util/assert.js";
import { parseGraphQLErrors } from "../services/util/is.js";

const AppDeploymentSteps = Object.freeze({
  NOT_STARTED: "NOT_STARTED",
  STARTING: "STARTING",
  BUILDING_ASSETS: "BUILDING_ASSETS",
  UPLOADING_ASSETS: "UPLOADING_ASSETS",
  CONVERGING_STORAGE: "CONVERGING_STORAGE",
  PUBLISHING_TREE: "PUBLISHING_TREE",
  RELOADING_SANDBOX: "RELOADING_SANDBOX",
  COMPLETED: "COMPLETED",
});

type AppDeploymentSteps = (typeof AppDeploymentSteps)[keyof typeof AppDeploymentSteps];

const stepToSpinnerStart = (syncJson: SyncJson, step: string): string => {
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

const stepToSpinnerEnd = (syncJson: SyncJson, step: string): string => {
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

export default defineCommand({
  name: "deploy",
  description: "Deploy an environment to production",
  details: sprint`
    Performs a two-step process: first pushes your local file changes to the environment,
    then deploys that environment to production. If local and environment files have
    diverged since the last sync, you'll be prompted to push your local changes and discard
    the environment's changes before the deploy proceeds. Use --force to skip this prompt.
  `,
  sections: [
    {
      title: "CI/CD Usage",
      content: sprint`
        In non-interactive environments, pass ${colors.subdued("--allow-all")} or individual
        ${colors.subdued("--allow-*")} flags to skip interactive prompts:

          ggt deploy --force --allow-all
          ggt deploy --force --allow=problems,charges,data-delete
          ggt deploy --force --allow-problems --allow-charges --allow-data-delete
      `,
    },
    {
      title: "See Also",
      content: "ggt problems — Check for errors before deploying.\nggt push — Upload files without deploying to production.",
    },
  ],
  examples: [
    "ggt deploy",
    "ggt deploy --env staging",
    "ggt deploy --force --allow-all",
    "ggt deploy --force --allow=problems,charges,data-delete",
    "ggt deploy --env staging --force --allow-problems --allow-charges --allow-data-delete",
  ],
  args: {
    ...SyncJsonArgs,
    "--force": {
      type: Boolean,
      alias: "-f",
      description: "Skip the push confirmation prompt",
      details: "Any conflicting changes on the environment are discarded without prompting.",
    },
    "--env": {
      type: String,
      alias: ["-e", "--environment", "--from"],
      description: "Environment to deploy from",
      valueName: "environment",
      complete: completeEnvironment,
      details:
        "The source development environment whose files and schema will be deployed to production. Defaults to the environment recorded in .gadget/sync.json.",
    },
    "--allow-problems": {
      type: Boolean,
      alias: "--allow-issues",
      description: "Allow deploying with problems",
      details:
        "Problems include Gelly errors, TypeScript errors, and missing references. Without this flag, the deploy is blocked until all issues are resolved.",
      brief: false,
    },
    "--allow-charges": {
      type: Boolean,
      description: "Allow deploying with new charges",
      details:
        "Use this flag in CI/CD pipelines to skip the interactive billing confirmation prompt that appears when a deploy would add charges to your plan.",
      brief: false,
    },
    "--allow-data-delete": {
      type: Boolean,
      description: "Allow deploying with data loss",
      details:
        "Removed models and fields have their production data permanently deleted. Without this flag, the deploy is blocked when removals are detected.",
      brief: false,
    },
  },
  run: async (ctx, args) => {
    const directory = await loadSyncJsonDirectory(process.cwd());
    const syncJson = await SyncJson.loadOrAskAndInit(ctx, { command: "deploy", args, directory });

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
      //  therefore, we need to push before we can deploy
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
          switch (true) {
            case hashes.bothChanged:
              content = sprint`Would you like to push your local changes and ${colors.emphasis("discard your environment's")} changes now?`;
              break;
            case hashes.localChangesToPush.size > 0:
              content = sprint`Would you like to push your local changes now?`;
              break;
            case hashes.environmentChanges.size > 0:
              content = sprint`Do you want to ${colors.emphasis("discard your environment's")} changes now?`;
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

        const graphqlErrors = parseGraphQLErrors(error.cause);
        if (graphqlErrors) {
          const graphqlError = graphqlErrors[0];
          assert(graphqlError, "expected graphqlError to be defined");

          if (graphqlError.extensions["requiresUpgrade"]) {
            println({ ensureEmptyLineAbove: true, content: graphqlError.message.replace(/GGT_PAYMENT_REQUIRED:?\s*/, "") });
            // Exits immediately -- upgrade errors are user-facing, not platform bugs
            process.exit(1);
          }
          if (graphqlError.extensions["requiresAdditionalCharge"]) {
            println({ ensureEmptyLineAbove: true, content: graphqlError.message.replace(/GGT_PAYMENT_REQUIRED:?\s*/, "") });
            await confirm({ ensureEmptyLineAbove: true, content: "Do you want to continue?" });
            subscription.resubscribe({ ...variables, allowCharges: true });
            return;
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
            println({
              ensureEmptyLineAbove: true,
              content: `${colors.warning("!")} ${colors.header("Issues found in your development app")}`,
            });
            printProblems({ problems: publishIssuesToProblems(issues) });
          }

          if (hasDataLoss) {
            println({
              ensureEmptyLineAbove: true,
              content: `${colors.warning("!")} ${colors.header("Data deleted on deploy")}`,
            });

            const updated = colors.updated("updated");
            const deleted = colors.deleted("deleted");

            const rows: { symbol: string; name: string; action: string; indent: number }[] = [];

            deletedModels.forEach((model: string) => {
              rows.push({ symbol: deletedSymbol, name: colors.deleted(model), action: deleted, indent: 0 });
            });

            deletedModelFields.forEach(({ modelIdentifier, fields }) => {
              rows.push({ symbol: updatedSymbol, name: colors.updated(modelIdentifier), action: updated, indent: 0 });
              fields.forEach((field) => {
                rows.push({ symbol: deletedSymbol, name: colors.deleted(field), action: deleted, indent: 2 });
              });
            });

            const longestNameLength = rows.reduce((longest, row) => Math.max(longest, row.name.length), 0);
            const longestIndent = rows.reduce((longest, row) => Math.max(longest, row.indent), 0);
            const indentSize = 2;

            println({
              ensureEmptyLineAbove: true,
              content: colors.hint("These changes will be applied to production based on the app you're deploying."),
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
              println(sprint`Deploying regardless of problems because "${colors.hint("--allow-problems")}" was passed.`);
            }

            if (allowDataDelete) {
              println(sprint`Deploying regardless of deleted data because "${colors.hint("--allow-data-delete")}" was passed.`);
            }
          }

          return;
        }

        if (status?.code === "Errored") {
          spinner?.fail(stepToSpinnerStart(syncJson, currentStep) + " " + ts());

          if (status.message) {
            println({ ensureEmptyLineAbove: true, content: colors.error(status.message) });
          }
          if (status.output) {
            println({ ensureEmptyLineAbove: true, content: sprint`${terminalLink("Check logs", status.output)}` });
          }
          return;
        }

        if (step === AppDeploymentSteps.COMPLETED) {
          spinner?.succeed(stepToSpinnerEnd(syncJson, currentStep));

          let content = colors.success("Deploy successful!");
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
  },
});
