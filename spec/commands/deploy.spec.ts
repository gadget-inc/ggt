import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext } from "../../spec/__support__/context.js";
import { makeSyncScenario } from "../../spec/__support__/filesync.js";
import { expectProcessExit } from "../../spec/__support__/process.js";
import { expectStdout } from "../../spec/__support__/stream.js";
import { Action, args, command as deploy } from "../../src/commands/deploy.js";
import { EditError } from "../../src/services/app/edit/error.js";
import { REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "../../src/services/app/edit/operation.js";
import { type Context } from "../../src/services/command/context.js";
import * as prompt from "../../src/services/output/prompt.js";
import { nockTestApps } from "../__support__/app.js";
import { makeMockEditSubscriptions } from "../__support__/edit.js";
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
    vi.spyOn(prompt, "select").mockResolvedValueOnce(Action.CANCEL);

    await makeSyncScenario({ localFiles: { "file.txt": "test" } });

    await expectProcessExit(() => deploy(ctx));
  });

  it("does not try to deploy if any problems were detected and displays the problems", async () => {
    vi.spyOn(prompt, "select").mockResolvedValue("0");

    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy(ctx);

    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
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
      App: test

      Issues detected

      • Other Issues 1 issue
         ✖ Add google keys for production
      "
    `);
  });

  it("deploys anyways even if there are problems if deploying with force flag", async () => {
    vi.spyOn(prompt, "select").mockResolvedValue("0");

    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy(ctx);

    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
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
      App: test

      Issues detected

      • Other Issues 1 issue
         ✖ Add google keys for production
      "
    `);

    vi.spyOn(prompt, "select").mockResolvedValue(Action.DEPLOY_ANYWAYS);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
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
      App: test

      Issues detected

      • Other Issues 1 issue
         ✖ Add google keys for production

      Building frontend assets ...

      Setting up database ...

      Copying development ...

      Restarting app ...

      Deploy completed. Good bye!

      Cmd/Ctrl + Click: ]8;;https://test.gadget.app/url/to/logs/with/traceIdView Logs]8;;
      "
    `);
  });

  it("deploys if there are no problems with the app", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();

    await deploy(ctx);
    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
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
      App: test

      Building frontend assets ...

      Setting up database ...

      Copying development ...

      Restarting app ...

      Deploy completed. Good bye!

      Cmd/Ctrl + Click: ]8;;https://test.gadget.app/url/to/logs/with/traceIdView Logs]8;;
      "
    `);
  });

  it("can not deploy if the maximum number of applications has been reached", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditSubscriptions();
    const error = new EditError(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION, [
      {
        message: "GGT_PAYMENT_REQUIRED: Payment is required for this application.",
      },
    ]);

    await deploy(ctx);
    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    await publishStatus.emitError(error);

    expectStdout().toMatchInlineSnapshot(`
      "
      App: test
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

    const error = new EditError(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION, cause);

    await deploy(ctx);
    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    await publishStatus.emitResponse({
      data: {
        publishStatus: {
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
      App: test

      Building frontend assets ...

      An error occurred while communicating with Gadget
      "
    `);
  });

  it("exits if the deploy process failed during a deploy step and displays link for logs", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditGraphQLSubscriptions();

    await deploy(ctx);
    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "NOT_STARTED",
          issues: [],
          status: undefined,
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
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

    await publishStatus.emitResult({
      data: {
        publishStatus: {
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

    await publishStatus.emitResult({
      data: {
        publishStatus: {
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
      App: test

      Building frontend assets ...

      GGT_ASSET_BUILD_FAILED: An error occurred while building production assets

      Cmd/Ctrl + Click: ]8;;https://test.gadget.app/url/to/logs/with/traceIdView Logs]8;;
      "
    `);
  });
});
