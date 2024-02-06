import chalk from "chalk";
import assert from "node:assert";
import ora from "ora";
import terminalLink from "terminal-link";
import { PUBLISH_STATUS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import { type Command, type Usage } from "../services/command/command.js";
import { DeployDisallowedError, UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { ProblemSeverity, issuesToProblems, printProblems } from "../services/output/problems.js";
import { confirm } from "../services/output/prompt.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { isCloseEvent, isGraphQLErrors } from "../services/util/is.js";
import { args as PushArgs } from "./push.js";

export type DeployArgs = typeof args;

export const args = {
  ...PushArgs,
  "--allow-issues": { type: Boolean, alias: "--allow-problems" },
};

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Deploy a development environment to production.

      {bold USAGE}
        ggt deploy

      {bold EXAMPLES}
        $ ggt deploy
        $ ggt deploy --env=staging
        $ ggt deploy --env=staging --force
        $ ggt deploy --env=staging --force --allow-issues

      {bold FLAGS}
        -a, --app=<name>      The Gadget application to deploy
        -e, --env=<name>      The Gadget environment to deploy from
            --force           Discard Gadget's changes
            --allow-issues    Deploy regardless of any issues found

        Run "ggt deploy --help" for more information.
    `;
  }

  return sprint`
    Deploy a development environment to production.

    Deploy ensures your directory is in sync with your current
    development environment and that it is in a deployable state.

    If there are any issues, it will first display them and ask
    if you would like to deploy anyways.

    {bold USAGE}

      ggt deploy [--app=<name>] [--env=<name>] [--force]
                 [--allow-issues]

    {bold EXAMPLES}

      $ ggt deploy
      $ ggt deploy --env=staging
      $ ggt deploy --env=staging --force
      $ ggt deploy --env=staging --force --allow-issues

    {bold FLAGS}

      -a, --app, --application=<name>
        The Gadget application to deploy.

        If not provided, the application will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found, you will be
        prompted to choose an application from your list of apps.

      -e, --env, --environment=<name>
        The environment to deploy from.

        If not provided, the environment will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found, you will be
        prompted to choose an environment from your list of environments.

      --prefer=<filesystem>
        Which filesystem's changes to automatically keep when
        conflicting changes are detected.

        If not provided, deploy will pause when conflicting changes are
        detected and you will be prompted to choose which changes to
        keep before deploy resumes.

        Must be one of "local" or "gadget".

      --allow-unknown-directory
        Allows deploy to continue when the chosen directory already
        contains files and does not contain a valid ".gadget/sync.json"
        file within it, or any of its parent directories.

        Defaults to false.

      --allow-different-app
        Allows deploy to continue when the chosen directory contains a
        valid ".gadget/sync.json" file, but the application within
        it does not match the application provided by the --app flag.

        Defaults to false.

      --force
        Deploy your development environment to production regardless
        of any issues it may have.

        These issues may include:
          • Syntax errors
          • TypeScript errors
          • Missing fields that should be present on models

    Run "ggt deploy -h" for less information.
`;
};

export const command: Command<DeployArgs> = async (ctx) => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { directory });
  if (!syncJson) {
    throw new UnknownDirectoryError(ctx, { directory });
  }

  ctx.log.printlns`
    Deploying ${syncJson.env.name} to ${terminalLink(syncJson.app.primaryDomain, `https://${syncJson.app.primaryDomain}/`)}
  `;

  const filesync = new FileSync(syncJson);
  const { inSync } = await filesync.hashes(ctx);
  if (!inSync) {
    ctx.log.printlns`
      Your local filesystem must be in sync with your development
      environment before you can deploy.
    `;

    await confirm(ctx, { message: "Would you like to push now?" });
    await filesync.push(ctx);
  }

  const spinner = ora();
  let printedIssues = false;

  // subscribes to the graphql subscription that will listen and send
  // back the server contract status
  const subscription = syncJson.edit.subscribe({
    subscription: PUBLISH_STATUS_SUBSCRIPTION,
    variables: { localFilesVersion: String(syncJson.filesVersion), force: ctx.args["--allow-issues"] },
    onError: (error) => {
      ctx.log.error("failed to deploy", { error });
      spinner.fail();

      if (isCloseEvent(error.cause)) {
        ctx.log.printlns(error.message);
      } else if (isGraphQLErrors(error.cause)) {
        const message = error.cause[0]?.message;
        assert(message, "expected message to be defined");

        if (message.includes("GGT_PAYMENT_REQUIRED")) {
          ctx.log.println("Production environment limit reached. Upgrade your plan to deploy");
        } else {
          ctx.log.println(message);
        }
      }

      return;
    },
    onData: async ({ publishStatus }): Promise<void> => {
      if (!publishStatus) {
        ctx.log.warn("received empty publish status");
        return;
      }

      const { publishStarted, progress: step, issues, status } = publishStatus;
      if (!printedIssues && issues.length > 0) {
        printedIssues = true;

        const fatalIssues = issues.filter((issue) => issue.severity === ProblemSeverity.Fatal);
        if (fatalIssues.length > 0) {
          await reportErrorAndExit(ctx, new DeployDisallowedError(issuesToProblems(fatalIssues)));
        }

        ctx.log.printlns`{bold Issues found}`;
        printProblems(ctx, { problems: issuesToProblems(issues) });

        if (!publishStarted) {
          await confirm(ctx, { message: "Do you want to continue?" });
          subscription.resubscribe({ localFilesVersion: String(syncJson.filesVersion), force: true });
        } else {
          assert(ctx.args["--force"], "expected --force to be true");
          ctx.log.printlns2`
            Deploying regardless of issues because "--force" was passed
          `;
        }

        return;
      }

      if (status?.code === "Errored") {
        subscription.unsubscribe();
        spinner.fail();
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
        spinner.succeed();
        let message = chalk.green("Deploy successful!");
        if (status?.output) {
          message += ` ${terminalLink("Check logs", status.output)}`;
        }
        ctx.log.printlns(message);
        return;
      }

      const spinnerText = stepToSpinnerText(syncJson, step);
      if (spinnerText !== spinner.text) {
        if (spinner.text) {
          spinner.succeed();
        }
        spinner.start(spinnerText);
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
