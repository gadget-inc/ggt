/* eslint-disable no-irregular-whitespace */
import nock from "nock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeContext } from "../../spec/__support__/context.js";
import { makeSyncScenario } from "../../spec/__support__/filesync.js";
import { expectProcessExit } from "../../spec/__support__/process.js";
import { args, command as deploy } from "../../src/commands/deploy.js";
import { PUBLISH_STATUS_SUBSCRIPTION } from "../../src/services/app/edit/operation.js";
import { ClientError } from "../../src/services/app/error.js";
import { type Context } from "../../src/services/command/context.js";
import { DeployDisallowedError } from "../../src/services/filesync/error.js";
import { nockTestApps } from "../__support__/app.js";
import { expectReportErrorAndExit } from "../__support__/error.js";
import { makeMockEditSubscriptions } from "../__support__/graphql.js";
import { mockConfirmOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { mockSystemTime } from "../__support__/time.js";
import { loginTestUser } from "../__support__/user.js";

describe("deploy", () => {
  mockSystemTime();

  let ctx: Context<typeof args>;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();

    ctx = makeContext({ parse: args });
  });

  afterEach(() => {
    ctx.abort();
    expect(nock.pendingMocks()).toEqual([]);
  });

  it("does not try to deploy if local files are not up to date with remote", async () => {
    mockConfirmOnce(() => process.exit(0));

    await makeSyncScenario({ localFiles: { "file.txt": "test" } });

    await expectProcessExit(() => deploy(ctx));
  });

  it("does not try to deploy if any problems were detected and displays the problems", async () => {
    mockConfirmOnce(() => process.exit(0));

    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy(ctx);

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await expectProcessExit(() =>
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
              },
            ],
            status: undefined,
          },
        },
      }),
    );

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      Deploying development to test.gadget.app (​https://test.gadget.app/​)

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      Problems found.

      • routes/GET-hello.js 1 problem
        ✖ JavaScript Unexpected keyword or identifier. line 13

      • routes/GET-test.ts 2 problems
        ✖ TypeScript Identifier expected. line 10
        ✖ TypeScript Expression expected. line 15

      • models/example/comp.gelly 1 problem
        ✖ Gelly Unknown identifier \\"tru\\"

      • Other 1 problem
        ✖ Add google keys for production
      Do you want to continue?"
    `);
  });

  it("deploys even if there are problems when --allow-problems is passed", async () => {
    ctx = ctx.child({ overwrite: { "--allow-problems": true } });

    await makeSyncScenario({ localFiles: { ".gadget/": "" }, ctx });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy(ctx);

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

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      Deploying development to test.gadget.app (​https://test.gadget.app/​)

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      Problems found.

      • Other 1 problem
        ✖ Add google keys for production

      Deploying regardless of problems because \\"--allow-problems\\" was passed.
      "
    `);

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
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      Deploying development to test.gadget.app (​https://test.gadget.app/​)

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      Problems found.

      • Other 1 problem
        ✖ Add google keys for production

      Deploying regardless of problems because \\"--allow-problems\\" was passed.

      ⠙ Building frontend assets.
      ✔ Built frontend assets. 12:00:00 AM

      ⠙ Setting up database.
      ✔ Setup database. 12:00:00 AM

      ⠙ Copying development.
      ✔ Copied development. 12:00:00 AM

      ⠙ Restarting app.
      ✔ Restarted app. 12:00:00 AM

      Deploy successful! Check logs (​https://test.gadget.app/url/to/logs/with/traceId​).
      "
    `);
  });

  it("deploys if there are no problems with the app", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy(ctx);
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
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      Deploying development to test.gadget.app (​https://test.gadget.app/​)

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

      Deploy successful! Check logs (​https://test.gadget.app/url/to/logs/with/traceId​).
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

    await deploy(ctx);

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);
    await expectProcessExit(() => publishStatus.emitError(error), 1);

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      Deploying development to test.gadget.app (​https://test.gadget.app/​)

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      Production environment limit reached. Upgrade your plan to deploy.
      "
    `);
  });

  it("prompts the user to confirm if there is going to be a deploy charge", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });
    mockConfirmOnce();

    const mockEditGraphQL = makeMockEditSubscriptions();
    const error = new ClientError(PUBLISH_STATUS_SUBSCRIPTION, [
      {
        message: "GGT_PAYMENT_REQUIRED: Deploying this app to production will add $25.00 to your existing monthly plan.",
        extensions: {
          requiresAdditionalCharge: true,
        },
      },
    ]);

    await deploy(ctx);

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);
    await publishStatus.emitError(error);

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      Deploying development to test.gadget.app (​https://test.gadget.app/​)

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      Deploying this app to production will add $25.00 to your existing monthly plan.

      Do you want to continue?
      "
    `);
  });

  it("exits if the subscription unexpectedly closes due to an Internal Error", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });
    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy(ctx);

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

    const error = new ClientError(PUBLISH_STATUS_SUBSCRIPTION, {
      type: "close",
      code: 4500,
      reason: "Internal Error",
      wasClean: true,
    });

    await expectReportErrorAndExit(error, () => publishStatus.emitError(error));

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      Deploying development to test.gadget.app (​https://test.gadget.app/​)

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      ⠙ Building frontend assets.
      ✖ Building frontend assets.

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

    await deploy(ctx);

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
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      Deploying development to test.gadget.app (​https://test.gadget.app/​)

      ⠙ Calculating file changes.
      ✔ Your files are up to date. 12:00:00 AM

      ⠙ Building frontend assets.
      ✖ Building frontend assets.

      GGT_ASSET_BUILD_FAILED: An error occurred while building production assets

      Check logs (​https://test.gadget.app/url/to/logs/with/traceId​)
      "
    `);
  });

  it("prints out fatal errors in the terminal and exit with code 1 if there are fatal errors", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });
    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy(ctx);

    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await expectReportErrorAndExit(expect.any(DeployDisallowedError), () =>
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
    );

    expectStdout().toMatchInlineSnapshot(`
      "Application  test
      Environment  development
           Branch  test-branch
      ------------------------
       Preview     https://test--development.gadget.app
       Editor      https://test.gadget.app/edit/development
       Playground  https://test.gadget.app/api/playground/graphql?environment=development
       Docs        https://docs.gadget.dev/api/test

      Deploying development to test.gadget.app (​https://test.gadget.app/​)

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
});
