import chalk from "chalk";
import assert from "node:assert";
import terminalLink from "terminal-link";
import { PUBLISH_STATUS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import { type Command, type Usage } from "../services/command/command.js";
import { DeployDisallowedError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { ProblemSeverity, printProblems, publishIssuesToProblems } from "../services/output/problems.js";
import { confirm } from "../services/output/prompt.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { failSpinner, spinnerText, startSpinner, succeedSpinner } from "../services/output/spinner.js";
import { sprint } from "../services/output/sprint.js";
import { isCloseEvent, isGraphQLErrors } from "../services/util/is.js";
import { args as PushArgs } from "./push.js";

export type DeployArgs = typeof args;

export const args = {
  ...PushArgs,
  "--env": { type: String, alias: ["-e", "--from", "--environment"] },
  "--allow-problems": { type: Boolean, alias: "--allow-issues" },
  "--allow-charges": { type: Boolean },
};

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Deploy your development environment to production.

      Your local filesystem must be in sync with your development
      environment before you can deploy.

      Changes are calculated from the last time you ran
      "ggt dev", "ggt push", or "ggt pull" on your local filesystem.

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
            --force           Discard un-synchronized environment changes
            --allow-problems  Deploy regardless of any problems on the environment
            --allow-charges   Deploy even if doing so will add charges to your account

      Run "ggt deploy --help" for more information.
    `;
  }

  return sprint`
    Deploy your development environment to production.

    Your local filesystem must be in sync with your development
    environment before you can deploy.

    Changes are calculated from the last time you ran
    "ggt dev", "ggt push", or "ggt pull" on your local filesystem.

    If your environment has also made changes since the last sync,
    you will be prompted to discard them or abort the deploy.

    If any problems are detected, you will be prompted to continue,
    or abort the deploy.

    {bold USAGE}

      ggt deploy [--app=<name>] [--from=<env>] [--force]
                 [--allow-problems]

    {bold EXAMPLES}

      $ ggt deploy
      $ ggt deploy --from=staging
      $ ggt deploy --from=staging --force
      $ ggt deploy --from=staging --force --allow-problems

    {bold FLAGS}

      -a, --app, --application=<name>
        The application to deploy.

        Defaults to the application within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -e, --from, --env, --environment=<name>
        The development environment to deploy from.

        Defaults to the environment within the ".gadget/sync.json"
        file in the current directory or any parent directories.

      -f, --force
        Discard any changes made to your environment's filesystem
        since the last "ggt dev", "ggt push", or "ggt pull".

        Defaults to false.

      --allow-problems, --allow-issues
        Deploy your development environment to production regardless
        of any problems it may have.

        These problems may include:
          • Gelly syntax errors
          • TypeScript errors
          • Models with missing fields

        Defaults to false.

      --allow-charges
        Deploy your development environment to production even if
        doing so will add charges to your account.

        Defaults to false.

      --allow-unknown-directory
        Allows "ggt deploy" to continue when the current directory, nor
        any parent directories, contain a ".gadget/sync.json" file
        within it.

        Defaults to false.

      --allow-different-app
        Allows "ggt push" to continue with a different --app than the
        one found within the ".gadget/sync.json" file.

        Defaults to false.

    Run "ggt deploy -h" for less information.
`;
};

export const command: Command<DeployArgs> = async (ctx) => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.loadOrInit(ctx, { directory });

  ctx.log.printlns2`
    Deploying ${syncJson.env.name} to ${terminalLink(syncJson.app.primaryDomain, `https://${syncJson.app.primaryDomain}/`)}
  `;

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx);
  if (!hashes.inSync) {
    ctx.log.printlns`
      Your local filesystem must be in sync with your development
      environment before you can deploy.
    `;

    if (!ctx.args["--force"]) {
      await confirm(ctx, { message: "Would you like to push now?" });
    }

    await filesync.push(ctx, { hashes });
  }

  let printedProblems = false;

  // subscribes to the graphql subscription that will listen and send
  // back the server contract status

  const variables = {
    localFilesVersion: String(syncJson.filesVersion),
    force: ctx.args["--allow-problems"],
    allowCharges: ctx.args["--allow-charges"],
  };

  const subscription = syncJson.edit.subscribe({
    subscription: PUBLISH_STATUS_SUBSCRIPTION,
    variables,
    onError: async (error) => {
      ctx.log.error("failed to deploy", { error });

      let failMessage: string | undefined = undefined;

      if (isCloseEvent(error.cause)) {
        failMessage = error.message;
        ctx.log.printlns(error.message);
      } else if (isGraphQLErrors(error.cause)) {
        const message = error.cause[0]?.message;
        const extensions = error.cause[0]?.extensions;
        assert(message, "expected message to be defined");

        if (extensions?.["requiresUpgrade"]) {
          failMessage = message.replace(/GGT_PAYMENT_REQUIRED:?\s*/, "");
        } else if (extensions?.["requiresAdditionalCharge"]) {
          const paymentRequiredMessage = message.replace(/GGT_PAYMENT_REQUIRED:?\s*/, "");

          await confirm(ctx, { message: `${paymentRequiredMessage}\nDo you wish to proceed?` });
          subscription.resubscribe({ ...variables, allowCharges: true });
          return;
        } else {
          failMessage = message;
        }
      }

      failSpinner(failMessage ?? "Failed to deploy");

      return;
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

        ctx.log.printlns`{bold Problems found}`;
        printProblems(ctx, { problems: publishIssuesToProblems(issues) });

        if (!publishStarted) {
          await confirm(ctx, { message: "Do you want to continue?" });
          subscription.resubscribe({ ...variables, force: true });
        } else {
          assert(ctx.args["--allow-problems"], "expected --allow-problems to be true");
          ctx.log.printlns2`Deploying regardless of problems because "--allow-problems" was passed.`;
        }

        return;
      }

      if (status?.code === "Errored") {
        subscription.unsubscribe();

        failSpinner();

        if (status.message) {
          ctx.log.printlns`{red ${status.message}}`;
        }
        if (status.output) {
          ctx.log.printlns(terminalLink("Check logs", status.output));
        }
        return;
      }

      if (step === AppDeploymentSteps.COMPLETED) {
        subscription.unsubscribe();
        succeedSpinner();
        let message = chalk.green("Deploy successful!");
        if (status?.output) {
          message += ` ${terminalLink("Check logs", status.output)}`;
        }
        ctx.log.printlns(message);
        return;
      }

      const newSpinnerText = stepToSpinnerText(syncJson, step);
      const currentSpinnerText = spinnerText();
      if (newSpinnerText !== currentSpinnerText) {
        if (currentSpinnerText) {
          succeedSpinner();
        }
        startSpinner(newSpinnerText);
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

export const stepToSpinnerText = (syncJson: SyncJson, step: string): string => {
  switch (step) {
    case AppDeploymentSteps.NOT_STARTED:
    case AppDeploymentSteps.STARTING:
    case AppDeploymentSteps.BUILDING_ASSETS:
    case AppDeploymentSteps.UPLOADING_ASSETS:
      return "Building frontend assets";
    case AppDeploymentSteps.CONVERGING_STORAGE:
      return "Setting up database";
    case AppDeploymentSteps.PUBLISHING_TREE:
      return `Copying ${syncJson.env.name}`;
    case AppDeploymentSteps.RELOADING_SANDBOX:
      return "Restarting app";
    case AppDeploymentSteps.COMPLETED:
      return "Deploy completed";
    default:
      return "Unknown step";
  }
};
