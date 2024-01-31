import chalk from "chalk";
import assert from "node:assert";
import ora from "ora";
import terminalLink from "terminal-link";
import { PUBLISH_STATUS_SUBSCRIPTION } from "../services/app/edit/operation.js";
import type { ArgsDefinition } from "../services/command/arg.js";
import { type Command, type Usage } from "../services/command/command.js";
import { DeployDisallowedError } from "../services/filesync/error.js";
import { FileSync, FileSyncArgs } from "../services/filesync/filesync.js";
import { ProblemSeverity, issuesToProblems, printProblems } from "../services/output/problems.js";
import { confirm } from "../services/output/prompt.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { isCloseEvent, isGraphQLErrors } from "../services/util/is.js";

export const usage: Usage = (ctx) => {
  if (ctx.args["-h"]) {
    return sprint`
      Deploy your development environment to production.

      {bold USAGE}
        ggt deploy [DIRECTORY]

      {bold ARGUMENTS}
        DIRECTORY         The directory to sync files from and deploy (default: ".")

      {bold EXAMPLES}
        $ ggt deploy
        $ ggt deploy ~/gadget/example
        $ ggt deploy ~/gadget/example --app=example
        $ ggt deploy ~/gadget/example --app=example --prefer=local

      {bold FLAGS}
        -a, --app=<name>          The Gadget application to deploy
            --prefer=<filesystem>  Prefer "local" or "gadget" conflicting changes
            --force                Deploy regardless of any issues found

      Run "ggt deploy --help" for more information.
    `;
  }

  return sprint`
    Deploy your development environment to production.

    Deploy ensures your directory is in sync with your development
    environment and that it is in a deployable state. If there are any
    issues, it will display them and ask if you would like to deploy
    anyways.

    {bold USAGE}
      ggt deploy [DIRECTORY] [--app=<name>] [--prefer=<filesystem>] [--force]

    {bold EXAMPLES}

      $ ggt deploy
      $ ggt deploy ~/gadget/example
      $ ggt deploy ~/gadget/example --app=example
      $ ggt deploy ~/gadget/example --app=example --prefer=local
      $ ggt deploy ~/gadget/example --app=example --prefer=local --force

    {bold ARGUMENTS}

      DIRECTORY
        The path to the directory to sync your development environment's
        files to before deploying it to your production environment.
        The directory will be created if it does not exist.

        Defaults to the current working directory. (default: ".")

    {bold FLAGS}

      -a, --app=<name>
        The Gadget application to deploy.

        If not provided, the application will be inferred from the
        ".gadget/sync.json" file in the chosen directory or any of its
        parent directories.

        If a ".gadget/sync.json" file is not found, you will be
        prompted to choose an application from your list of apps.

      --prefer=<filesystem>
        Which filesystem's changes to automatically keep when
        conflicting changes are detected.

        If not provided, deploy will pause when conflicting changes are
        detected and you will be prompted to choose which changes to
        keep before deploy resumes.

        Must be one of "local" or "gadget".

      --force
        Deploy your development environment to production regardless
        of any issues it may have.

        These issues may include:
          • Syntax errors
          • TypeScript errors
          • Missing fields that should be present on models
`;
};

export const args = {
  ...FileSyncArgs,
} satisfies ArgsDefinition;

export const command: Command<typeof args> = async (ctx) => {
  // deploy --force != sync --force
  const filesync = await FileSync.init(ctx.child({ overwrite: { "--force": false } }));

  ctx.log.printlns`
    Deploying ${terminalLink(filesync.app.primaryDomain, `https://${filesync.app.primaryDomain}/`)}
  `;

  const { inSync } = await filesync.hashes();
  if (!inSync) {
    ctx.log.printlns`
      Your local filesystem must be in sync with your development
      environment before you can deploy.
    `;

    await confirm(ctx, { message: "Would you like to sync now?" });
    await filesync.sync();
  }

  const spinner = ora();
  let printedIssues = false;

  // subscribes to the graphql subscription that will listen and send
  // back the server contract status
  const subscription = filesync.edit.subscribe({
    subscription: PUBLISH_STATUS_SUBSCRIPTION,
    variables: { localFilesVersion: String(filesync.filesVersion), force: ctx.args["--force"] },
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
          subscription.resubscribe({ localFilesVersion: String(filesync.filesVersion), force: true });
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

      const spinnerText = stepToSpinnerText(step);
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

export const stepToSpinnerText = (step: string): string => {
  switch (step) {
    case AppDeploymentSteps.NOT_STARTED:
      return "Deploy not started";
    case AppDeploymentSteps.STARTING:
    case AppDeploymentSteps.BUILDING_ASSETS:
    case AppDeploymentSteps.UPLOADING_ASSETS:
      return "Building frontend assets";
    case AppDeploymentSteps.CONVERGING_STORAGE:
      return "Setting up database";
    case AppDeploymentSteps.PUBLISHING_TREE:
      return "Copying development";
    case AppDeploymentSteps.RELOADING_SANDBOX:
      return "Restarting app";
    case AppDeploymentSteps.COMPLETED:
      return "Deploy completed";
    default:
      return "Unknown step";
  }
};
