/* eslint-disable unicorn/no-null */
/* eslint-disable no-irregular-whitespace */
import nock from "nock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeContext } from "../../spec/__support__/context.js";
import { makeSyncScenario } from "../../spec/__support__/filesync.js";
import { expectProcessExit } from "../../spec/__support__/process.js";
import { expectStdout } from "../../spec/__support__/stream.js";
import { args, command as deploy } from "../../src/commands/deploy.js";
import { EditError } from "../../src/services/app/edit/error.js";
import { PUBLISH_STATUS_SUBSCRIPTION } from "../../src/services/app/edit/operation.js";
import { type Context } from "../../src/services/command/context.js";
import { confirm } from "../../src/services/output/prompt.js";
import { nockTestApps } from "../__support__/app.js";
import { makeMockEditSubscriptions } from "../__support__/edit.js";
import { mock } from "../__support__/mock.js";
import { loginTestUser } from "../__support__/user.js";

describe("deploy", () => {
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
    mock(confirm, () => process.exit(0));

    await makeSyncScenario({ localFiles: { "file.txt": "test" } });

    await expectProcessExit(() => deploy(ctx));
  });

  it("does not try to deploy if any problems were detected and displays the problems", async () => {
    mock(confirm, () => process.exit(0));

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
    );

    expectStdout().toMatchInlineSnapshot(`
      "
      Deploying test.gadget.app (​https://test.gadget.app/​)

      Issues found

      • routes/GET-hello.js 1 issue
        ✖ JavaScript Unexpected keyword or identifier. line 13

      • routes/GET-test.ts 2 issues
        ✖ TypeScript Identifier expected. line 10
        ✖ TypeScript Expression expected. line 15

      • models/example/comp.gelly 1 issue
        ✖ Gelly Unknown identifier \\"tru\\"

      • Other 1 issue
        ✖ Add google keys for production
      "
    `);
  });

  it("deploys anyways even if there are problems if deploying with force flag", async () => {
    ctx = ctx.child({ overwrite: { "--force": true } });

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
      "
      Deploying test.gadget.app (​https://test.gadget.app/​)

      Issues found

      • Other 1 issue
        ✖ Add google keys for production

      Deploying regardless of issues because \\"--force\\" was passed

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
      "
      Deploying test.gadget.app (​https://test.gadget.app/​)

      Issues found

      • Other 1 issue
        ✖ Add google keys for production

      Deploying regardless of issues because \\"--force\\" was passed


      Deploy successful! Check logs (​https://test.gadget.app/url/to/logs/with/traceId​)
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
      "
      Deploying test.gadget.app (​https://test.gadget.app/​)

      Deploy successful! Check logs (​https://test.gadget.app/url/to/logs/with/traceId​)
      "
    `);
  });

  it("can not deploy if the maximum number of applications has been reached", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();
    const error = new EditError(PUBLISH_STATUS_SUBSCRIPTION, [
      {
        message: "GGT_PAYMENT_REQUIRED: Payment is required for this application.",
      },
    ]);

    await deploy(ctx);
    const publishStatus = mockEditGraphQL.expectSubscription(PUBLISH_STATUS_SUBSCRIPTION);

    await publishStatus.emitError(error);

    expectStdout().toMatchInlineSnapshot(`
      "
      Deploying test.gadget.app (​https://test.gadget.app/​)
      Production environment limit reached. Upgrade your plan to deploy
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

    const error = new EditError(PUBLISH_STATUS_SUBSCRIPTION, cause);

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

    await publishStatus.emitError(error);

    expectStdout().toMatchInlineSnapshot(`
      "
      Deploying test.gadget.app (​https://test.gadget.app/​)

      An error occurred while communicating with Gadget
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
      "
      Deploying test.gadget.app (​https://test.gadget.app/​)

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
      "
      Deploying test.gadget.app (​https://test.gadget.app/​)

      Gadget has detected the following fatal errors with your files:

      • access-control.gadget.ts 2 issues
        ✖ Something went wrong
        ✖ Another message

      • settings.gadget.ts 1 issue
        ✖ Message from another file

      Please fix these errors and try again.

      If you think this is a bug, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });
});
