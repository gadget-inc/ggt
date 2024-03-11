import assert from "node:assert";
import terminalLink from "terminal-link";
import { PUBLISH_STATUS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import { type Command, type Usage } from "../services/command/command.js";
import { DeployDisallowedError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { confirm } from "../services/output/confirm.js";
import { output } from "../services/output/output.js";
import { println } from "../services/output/print.js";
import { ProblemSeverity, printProblems, publishIssuesToProblems } from "../services/output/problems.js";
import { reportErrorAndExit } from "../services/output/report.js";
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
};

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Deploy an environment to production.

      Your local files must match your environment's files
      before you can deploy. Changes are tracked from
      the last "ggt dev", "ggt push", or "ggt pull" run locally.

      {bold USAGE}
        ggt deploy

      {bold EXAMPLES}
        $ ggt deploy
        $ ggt deploy --from=staging
        $ ggt deploy --from=staging --force
        $ ggt deploy --from=staging --force --allow-problems

      {bold FLAGS}
        -a, --app=<name>      The application to deploy
        -e, --from=<env>      The environment to deploy from
            --force           Discard changes to your environment's filesystem
            --allow-problems  Deploy regardless of any problems the environment has
            --allow-charges   Deploy even if doing so will add charges to your account

      Run "ggt deploy --help" for more information.
    `;
  }

  return sprint`
    Deploy an environment to production.

    Your local files must match your environment's files
    before you can deploy. Changes are tracked from
    the last "ggt dev", "ggt push", or "ggt pull" run locally.

    If your local files don't match your environment's files, you will
    be prompted to push your local files before you can deploy.

    If your environment has un-pulled changes, and "--force" is not
    passed, you will be prompted to {underline discard them} or abort the deploy.

    {bold USAGE}

      ggt deploy [--app=<name>] [--from=<env>] [--force]
                 [--allow-problems] [--allow-charges]

    {bold EXAMPLES}

      $ ggt deploy
      $ ggt deploy --from=staging
      $ ggt deploy --from=staging --force
      $ ggt deploy --from=staging --force --allow-problems
      $ ggt deploy --from=staging --force --allow-problems --allow-charges

    {bold FLAGS}

      -a, --app, --application=<name>
        The application to deploy.

        Defaults to the application within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -e, --env, --environment, --from=<name>
        The environment to deploy from.

        Defaults to the environment within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -f, --force
        Discard any changes made to your environment's filesystem
        since the last "ggt dev", "ggt push", or "ggt pull".

        Defaults to false.

      --allow-problems, --allow-issues
        Deploy your environment to production regardless of any problems
        it may have.

        These problems may include:
          • Gelly syntax errors
          • TypeScript errors
          • Models with missing fields

        Defaults to false.

      --allow-charges
        Allows "ggt deploy" to continue when deploying your environment
        to production will add charges to your account.

        Defaults to false.

      --allow-unknown-directory
        Allows "ggt deploy" to continue when the current directory, nor
        any parent directories, contain a ".gadget/sync.json" file
        within it.

        Defaults to false.

      --allow-different-app
        Allows "ggt deploy" to continue with a different "--app" than the
        one found within the ".gadget/sync.json" file.

        Defaults to false.

    Run "ggt deploy -h" for less information.
`;
};

export const command: Command<DeployArgs> = async (ctx) => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.loadOrInit(ctx, { directory });

  println({ ensureEmptyLineAbove: true })`
    Deploying ${syncJson.env.name} to ${terminalLink(syncJson.app.primaryDomain, `https://${syncJson.app.primaryDomain}/`)}
  `;

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);
  if (!hashes.inSync && (hashes.localChangesToPush.size > 0 || !hashes.onlyDotGadgetFilesChanged)) {
    // the following is true:
    //   1. our local files don't match our environment's files
    //   2. we have local changes to push or non .gadget/ files have changed on our environment
    //  therefor, we need to push before we can deploy
    await filesync.print(ctx, { hashes });

    println({ ensureEmptyLineAbove: true })`
      Your environment's files must match your local files before you can deploy.
    `;

    // some scenarios make the confirmation to push changes imply the
    // --force flag (e.g. when both local and environment files have
    // changed, or when only environment files have changed)
    let implicitForce = false;

    if (output.isInteractive) {
      let message: string;
      switch (true) {
        case hashes.bothChanged:
          message = sprint`Would you like to push your local changes and {underline discard your environment's} changes now?`;
          implicitForce = true;
          break;
        case hashes.localChangesToPush.size > 0:
          message = sprint`Would you like to push your local changes now?`;
          break;
        case hashes.environmentChanges.size > 0:
          message = sprint`Do you want to {underline discard your environment's} changes now?`;
          implicitForce = true;
          break;
        default:
          unreachable("no changes to push or discard");
      }

      await confirm({ ensureEmptyLineAbove: true })(message);
    } else {
      println({ ensureEmptyLineAbove: true })`
        Assuming you want to push your local files now.
      `;
    }

    await filesync.push(ctx, { hashes, force: implicitForce || ctx.args["--force"] });
  }

  const variables = {
    localFilesVersion: String(syncJson.filesVersion),
    force: ctx.args["--allow-problems"],
    allowCharges: ctx.args["--allow-charges"],
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

        switch (true) {
          case graphqlError.extensions["requiresUpgrade"]:
            println({ ensureEmptyLineAbove: true })(graphqlError.message.replace(/GGT_PAYMENT_REQUIRED:?\s*/, ""));
            process.exit(1);
            break;
          case graphqlError.extensions["requiresAdditionalCharge"]:
            println({ ensureEmptyLineAbove: true })(graphqlError.message.replace(/GGT_PAYMENT_REQUIRED:?\s*/, ""));
            await confirm({ ensureEmptyLineAbove: true })("Do you want to continue?");
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

      const { publishStarted, progress: step, issues, status } = publishStatus;
      if (!printedProblems && issues.length > 0) {
        printedProblems = true;

        const fatalIssues = issues.filter((issue) => issue.severity === ProblemSeverity.Fatal);
        if (fatalIssues.length > 0) {
          await reportErrorAndExit(ctx, new DeployDisallowedError(publishIssuesToProblems(fatalIssues)));
        }

        println({ ensureEmptyLineAbove: true })`{bold Problems found.}`;
        printProblems({ problems: publishIssuesToProblems(issues) });

        if (!publishStarted) {
          await confirm("Do you want to continue?");
          subscription.resubscribe({ ...variables, force: true });
        } else {
          assert(ctx.args["--allow-problems"], "expected --allow-problems to be true");
          println({ ensureEmptyLineAbove: true })`Deploying regardless of problems because {bold "--allow-problems"} was passed.`;
        }

        return;
      }

      if (status?.code === "Errored") {
        subscription.unsubscribe();
        spinner?.fail(stepToSpinnerStart(syncJson, currentStep) + " " + ts());

        if (status.message) {
          println({ ensureEmptyLineAbove: true })`{red ${status.message}}`;
        }
        if (status.output) {
          println({ ensureEmptyLineAbove: true })`${terminalLink("Check logs", status.output)}`;
        }
        return;
      }

      if (step === AppDeploymentSteps.COMPLETED) {
        subscription.unsubscribe();
        spinner?.succeed(stepToSpinnerEnd(syncJson, currentStep));

        let message = sprint`{green Deploy successful!}`;
        if (status?.output) {
          message += ` ${terminalLink("Check logs", status.output)}.`;
        }

        println({ ensureEmptyLineAbove: true })(message);
        return;
      }

      if (step !== currentStep) {
        const spinnerText = stepToSpinnerStart(syncJson, step);
        if (spinnerText !== spinner?.text) {
          // stop the current spinner, if any, and start a new one
          spinner?.succeed(stepToSpinnerEnd(syncJson, currentStep));

          const ensureEmptyLineAbove = currentStep === AppDeploymentSteps.NOT_STARTED || !output.isInteractive;
          spinner = spin({ ensureEmptyLineAbove })(spinnerText);
        }

        currentStep = step as AppDeploymentSteps;
      }
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
      return `Copying ${syncJson.env.name}.`;
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
      return `Copied ${syncJson.env.name}. ${ts()}`;
    case AppDeploymentSteps.RELOADING_SANDBOX:
      return `Restarted app. ${ts()}`;
    case AppDeploymentSteps.COMPLETED:
      return "Deploy successful!";
    default:
      return `Completed unknown step. ${ts()}`;
  }
};
