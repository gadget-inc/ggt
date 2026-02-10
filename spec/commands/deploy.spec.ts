import { beforeEach, describe, expect, it } from "vitest";

import { makeSyncScenario } from "../../spec/__support__/filesync.js";
import { expectProcessExit } from "../../spec/__support__/process.js";
import * as deploy from "../../src/commands/deploy.js";
import { PUBLISH_STATUS_SUBSCRIPTION } from "../../src/services/app/edit/operation.js";
import { ClientError } from "../../src/services/app/error.js";
import { confirm } from "../../src/services/output/confirm.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { makeMockEditSubscriptions } from "../__support__/graphql.js";
import { mockConfirmOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { mockSystemTime } from "../__support__/time.js";
import { loginTestUser } from "../__support__/user.js";

describe("deploy", () => {
  mockSystemTime();

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("does not try to deploy if any problems were detected and displays the problems", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy.run(testCtx, makeArgs(deploy.args));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await expectProcessExit(
      () =>
        publishStatus.emitResponse({
          data: {
            publishStatus: {
              publishStarted: false,
              remoteFilesVersion: "1",
              progress: "NOT_STARTED",
              issues: [
                {
                  severity: "Error",
                  message: "Unexpected keyword or identifier.",
                  node: {
                    type: "SourceFile",
                    key: "routes/GET-hello.js",
                    apiIdentifier: "routes/GET-hello.js",
                    name: null,
                    fieldType: null,
                    parentKey: null,
                    parentApiIdentifier: null,
                  },
                  nodeLabels: [
                    {
                      type: "File",
                      identifier: "line 13",
                    },
                  ],
                },
                {
                  severity: "Error",
                  message: "Identifier expected.",
                  node: {
                    type: "SourceFile",
                    key: "routes/GET-test.ts",
                    apiIdentifier: "routes/GET-test.ts",
                    name: null,
                    fieldType: null,
                    parentKey: null,
                    parentApiIdentifier: null,
                  },
                  nodeLabels: [
                    {
                      type: "File",
                      identifier: "line 10",
                    },
                  ],
                },
                {
                  severity: "Error",
                  message: "Expression expected.",
                  node: {
                    type: "SourceFile",
                    key: "routes/GET-test.ts",
                    apiIdentifier: "routes/GET-test.ts",
                    name: null,
                    fieldType: null,
                    parentKey: null,
                    parentApiIdentifier: null,
                  },
                  nodeLabels: [
                    {
                      type: "File",
                      identifier: "line 15",
                    },
                  ],
                },
                {
                  severity: "Error",
                  message: 'Unknown identifier "tru"',
                  node: {
                    type: "SourceFile",
                    key: "models/example/comp.gelly",
                    apiIdentifier: "models/example/comp.gelly",
                    name: null,
                    fieldType: null,
                    parentKey: null,
                    parentApiIdentifier: null,
                  },
                  nodeLabels: [
                    {
                      type: "File",
                      identifier: "",
                    },
                  ],
                },
                {
                  severity: "Error",
                  message: "Add google keys for production",
                  node: null,
                  nodeLabels: null,
                },
              ],
              status: undefined,
            },
          },
        }),
      1,
    );

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      ! Issues found in your development app

      • routes/GET-hello.js 1 problem
        ✖ JavaScript Unexpected keyword or identifier. line 13

      • routes/GET-test.ts 2 problems
        ✖ TypeScript Identifier expected. line 10
        ✖ TypeScript Expression expected. line 15

      • models/example/comp.gelly 1 problem
        ✖ Gelly Unknown identifier "tru"

      • Other 1 problem
        ✖ Add google keys for production

      Do you want to continue?

      Aborting because ggt is not running in an interactive terminal.
      "
    `);
  });

  it("deploys even if there are problems when --allow-problems is passed", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy.run(testCtx, makeArgs(deploy.args, "deploy", "--allow-problems"));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "NOT_STARTED",
          issues: [
            {
              severity: "Error",
              message: "Add google keys for production",
              node: undefined,
            },
          ],
          status: undefined,
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "UPLOADING_ASSETS",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "CONVERGING_STORAGE",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "PUBLISHING_TREE",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "RELOADING_SANDBOX",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "COMPLETED",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      ! Issues found in your development app

      • Other 1 problem
        ✖ Add google keys for production
      Deploying regardless of problems because "--allow-problems" was passed.

      ⠙ Building frontend assets.
      ✔ Built frontend assets. 12:00:00 AM

      ⠙ Setting up database.
      ✔ Setup database. 12:00:00 AM

      ⠙ Copying development.
      ✔ Copied development. 12:00:00 AM

      ⠙ Restarting app.
      ✔ Restarted app. 12:00:00 AM

      Deploy successful! Check logs https://test.gadget.app/url/to/logs/with/traceId.
      "
    `);
  });

  it("does not try to deploy if any deleted data will occur and displays the soon to be deleted data", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy.run(testCtx, makeArgs(deploy.args));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await expectProcessExit(
      () =>
        publishStatus.emitResponse({
          data: {
            publishStatus: {
              publishStarted: false,
              remoteFilesVersion: "1",
              progress: "NOT_STARTED",
              issues: [],
              deletedModelsAndFields: {
                deletedModels: ["modelA"],
                deletedModelFields: [],
              },
              status: undefined,
            },
          },
        }),
      1,
    );

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      ! Data deleted on deploy

      These changes will be applied to production based on the app you're deploying.
            - modelA  deleted

      Do you want to continue?

      Aborting because ggt is not running in an interactive terminal.
      "
    `);
  });

  it("deploys even if there are problems when --allow-data-delete is passed", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy.run(testCtx, makeArgs(deploy.args, "deploy", "--allow-data-delete"));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "NOT_STARTED",
          issues: [],
          deletedModelsAndFields: {
            deletedModels: ["modelA"],
            deletedModelFields: [],
          },
          status: undefined,
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "UPLOADING_ASSETS",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "CONVERGING_STORAGE",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "PUBLISHING_TREE",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "RELOADING_SANDBOX",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "COMPLETED",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      ! Data deleted on deploy

      These changes will be applied to production based on the app you're deploying.
            - modelA  deleted
      Deploying regardless of deleted data because "--allow-data-delete" was passed.

      ⠙ Building frontend assets.
      ✔ Built frontend assets. 12:00:00 AM

      ⠙ Setting up database.
      ✔ Setup database. 12:00:00 AM

      ⠙ Copying development.
      ✔ Copied development. 12:00:00 AM

      ⠙ Restarting app.
      ✔ Restarted app. 12:00:00 AM

      Deploy successful! Check logs https://test.gadget.app/url/to/logs/with/traceId.
      "
    `);
  });

  it("deploys if there are no problems with the app", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy.run(testCtx, makeArgs(deploy.args));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "NOT_STARTED",
          issues: [],
          status: undefined,
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "UPLOADING_ASSETS",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "CONVERGING_STORAGE",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "PUBLISHING_TREE",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "RELOADING_SANDBOX",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "COMPLETED",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      ⠙ Building frontend assets.
      ✔ Built frontend assets. 12:00:00 AM

      ⠙ Setting up database.
      ✔ Setup database. 12:00:00 AM

      ⠙ Copying development.
      ✔ Copied development. 12:00:00 AM

      ⠙ Restarting app.
      ✔ Restarted app. 12:00:00 AM

      Deploy successful! Check logs https://test.gadget.app/url/to/logs/with/traceId.
      "
    `);
  });

  it("can not deploy if the maximum number of applications has been reached", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();
    const error = new ClientError(PUBLISH_STATUS_SUBSCRIPTION, [
      {
        message: "GGT_PAYMENT_REQUIRED: Production environment limit reached. Upgrade your plan to deploy.",
        extensions: {
          requiresUpgrade: true,
        },
      },
    ]);

    await deploy.run(testCtx, makeArgs(deploy.args));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await expectProcessExit(() => publishStatus.emitError(error), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      Production environment limit reached. Upgrade your plan to deploy.
      "
    `);
  });

  it("prompts the user to confirm if there is going to be a deploy charge", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();
    const error = new ClientError(PUBLISH_STATUS_SUBSCRIPTION, [
      {
        message: "GGT_PAYMENT_REQUIRED: Deploying this app to production will add $25.00 to your existing monthly plan.",
        extensions: {
          requiresAdditionalCharge: true,
        },
      },
    ]);

    await deploy.run(testCtx, makeArgs(deploy.args));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await expectProcessExit(() => publishStatus.emitError(error), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      Deploying this app to production will add $25.00 to your existing monthly plan.

      Do you want to continue?

      Aborting because ggt is not running in an interactive terminal.
      "
    `);
  });

  it("exits if the subscription unexpectedly closes due to an Internal Error", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    const cause = {
      type: "close",
      code: 4500,
      reason: "Internal Error",
      wasClean: true,
    };

    const error = new ClientError(PUBLISH_STATUS_SUBSCRIPTION, cause);

    await deploy.run(testCtx, makeArgs(deploy.args));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "NOT_STARTED",
          issues: [],
          status: undefined,
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await expectProcessExit(() => publishStatus.emitError(error), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      ⠙ Building frontend assets.
      ✘ Building frontend assets. 12:00:00 AM

      An error occurred while communicating with Gadget

      The connection to Gadget closed unexpectedly.

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });

  it("exits if the deploy process failed during a deploy step and displays link for logs", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy.run(testCtx, makeArgs(deploy.args));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "NOT_STARTED",
          issues: [],
          status: undefined,
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: true,
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
          status: {
            code: "Pending",
            message: undefined,
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
          publishStarted: false,
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
          status: {
            code: "Errored",
            message: "GGT_ASSET_BUILD_FAILED: An error occurred while building production assets",
            output: "https://test.gadget.app/url/to/logs/with/traceId",
          },
        },
      },
    });

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      ⠙ Building frontend assets.
      ✘ Building frontend assets. 12:00:00 AM

      GGT_ASSET_BUILD_FAILED: An error occurred while building production assets

      Check logs https://test.gadget.app/url/to/logs/with/traceId
      "
    `);
  });

  it("prints out fatal errors in the terminal and exit with code 1 if there are fatal errors", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy.run(testCtx, makeArgs(deploy.args));

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await expectProcessExit(
      () =>
        publishStatus.emitResponse({
          data: {
            publishStatus: {
              publishStarted: false,
              remoteFilesVersion: "1",
              progress: "NOT_STARTED",
              issues: [
                {
                  severity: "Fatal",
                  message: "Something went wrong",
                  node: {
                    type: "SourceFile",
                    key: "access-control.gadget.ts",
                    apiIdentifier: "access-control.gadget.ts",
                  },
                },
                {
                  severity: "Fatal",
                  message: "Another message",
                  node: {
                    type: "SourceFile",
                    key: "access-control.gadget.ts",
                    apiIdentifier: "access-control.gadget.ts",
                  },
                },
                {
                  severity: "Fatal",
                  message: "Message from another file",
                  node: {
                    type: "SourceFile",
                    key: "settings.gadget.ts",
                    apiIdentifier: "settings.gadget.ts",
                  },
                },
              ],
              status: undefined,
            },
          },
        }),
      1, // ggt should exit with code 1 if there are fatal errors
    );

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      Gadget has detected the following fatal errors with your files:

      • access-control.gadget.ts 2 problems
        ✖ Something went wrong
        ✖ Another message

      • settings.gadget.ts 1 problem
        ✖ Message from another file

      Please fix these errors and try again.

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });

  it("discards gadget changes and sends local changes to gadget after confirmation", async () => {
    const { expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    mockConfirmOnce();

    await deploy.run(testCtx, makeArgs(deploy.args));

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
            },
            "2": {
              ".gadget/": "",
              "gadget-file.js": "// gadget",
            },
            "3": {
              ".gadget/": "",
              "local-file.js": "// local",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            "local-file.js": "// local",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
            "local-file.js": "// local",
          },
        }
      `);

    await expectLocalAndGadgetHashesMatch();

    expect(confirm).toHaveBeenCalledTimes(1);

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Calculated file changes. 12:00:00 AM

      Your local files have changed.
      +  local-file.js  created

      Your environment's files have also changed.
      +  gadget-file.js  created

      Your environment's files must match your local files before you can deploy.

      Would you like to push your local changes and discard your environment's changes now?

      ⠙ Pushing files. →
      -  gadget-file.js  delete
      +  local-file.js   create
      ✔ Pushed files. → 12:00:00 AM
      -  gadget-file.js  deleted
      +  local-file.js   created
      "
    `);
  });

  it("discards gadget changes and sends local changes to gadget if --force is passed", async () => {
    const { expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await deploy.run(testCtx, makeArgs(deploy.args, "deploy", "--force"));

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
            },
            "2": {
              ".gadget/": "",
              "gadget-file.js": "// gadget",
            },
            "3": {
              ".gadget/": "",
              "local-file.js": "// local",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            "local-file.js": "// local",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
            "local-file.js": "// local",
          },
        }
      `);

    await expectLocalAndGadgetHashesMatch();

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Calculated file changes. 12:00:00 AM

      Your local files have changed.
      +  local-file.js  created

      Your environment's files have also changed.
      +  gadget-file.js  created

      ⠙ Pushing files. →
      -  gadget-file.js  delete
      +  local-file.js   create
      ✔ Pushed files. → 12:00:00 AM
      -  gadget-file.js  deleted
      +  local-file.js   created
      "
    `);
  });

  it("discards gadget changes and sends local changes to gadget if --force is passed, except for .gadget/ files", async () => {
    const { expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        ".gadget/client.js": "// client",
      },
      localFiles: {
        ".gadget/client.js": "// client",
        "local-file.js": "// local",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client v2",
        "gadget-file.js": "// gadget",
      },
    });

    await deploy.run(testCtx, makeArgs(deploy.args, "deploy", "--force"));

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
              ".gadget/client.js": "// client",
            },
            "2": {
              ".gadget/": "",
              ".gadget/client.js": "// client v2",
              "gadget-file.js": "// gadget",
            },
            "3": {
              ".gadget/": "",
              ".gadget/client.js": "// client v2",
              "local-file.js": "// local",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            ".gadget/client.js": "// client v2",
            "local-file.js": "// local",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
            "local-file.js": "// local",
          },
        }
      `);

    await expect(expectLocalAndGadgetHashesMatch()).rejects.toThrowError();

    expectStdout().toMatchInlineSnapshot(`
      "Deploying development to test.gadget.app https://test.gadget.app/

      ⠙ Calculating file changes.
      ✔ Calculated file changes. 12:00:00 AM

      Your local files have changed.
      +  local-file.js  created

      Your environment's files have also changed.
      +  gadget-file.js  created

      ⠙ Pushing files. →
      -  gadget-file.js  delete
      +  local-file.js   create
      ✔ Pushed files. → 12:00:00 AM
      -  gadget-file.js  deleted
      +  local-file.js   created
      "
    `);
  });
});
