import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext } from "../../spec/__support__/context.js";
import { makeSyncScenario } from "../../spec/__support__/filesync.js";
import { expectProcessExit } from "../../spec/__support__/process.js";
import { expectStdout } from "../../spec/__support__/stream.js";
import { Action, args, command as deploy } from "../../src/commands/deploy.js";
import { EditGraphQLError, REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "../../src/services/app/edit-graphql.js";
import { type Context } from "../../src/services/command/context.js";
import * as prompt from "../../src/services/output/prompt.js";
import { nockTestApps } from "../__support__/app.js";
import { makeMockEditGraphQLSubscriptions } from "../__support__/edit-graphql.js";
import { loginTestUser } from "../__support__/user.js";

describe("deploy", () => {
  let ctx: Context<typeof args>;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();

    ctx = makeContext(args);
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

    const mockEditGraphQL = makeMockEditGraphQLSubscriptions();

    await deploy(ctx);

    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    await publishStatus.emitResult({
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
        },
      },
    });

    expectStdout().toMatchInlineSnapshot(`
      "
      App: test

      Issues detected

      • Add google keys for production
      "
    `);
  });

  it("deploys anyways even if there are problems if deploying with force flag", async () => {
    vi.spyOn(prompt, "select").mockResolvedValue("0");

    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditGraphQLSubscriptions();

    await deploy(ctx);

    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    await publishStatus.emitResult({
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
        },
      },
    });

    expectStdout().toMatchInlineSnapshot(`
      "
      App: test

      Issues detected

      • Add google keys for production
      "
    `);

    vi.spyOn(prompt, "select").mockResolvedValue(Action.DEPLOY_ANYWAYS);

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "UPLOADING_ASSETS",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "CONVERGING_STORAGE",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "PUBLISHING_TREE",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "RELOADING_SANDBOX",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "COMPLETED",
          issues: [],
        },
      },
    });

    expectStdout().toMatchInlineSnapshot(`
      "
      App: test

      Issues detected

      • Add google keys for production

      Building frontend assets ...

      Setting up database ...

      Copying development ...

      Restarting app ...

      Deploy completed. Good bye!
      "
    `);
  });

  it("deploys if there are no problems with the app", async () => {
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
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "UPLOADING_ASSETS",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "CONVERGING_STORAGE",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "PUBLISHING_TREE",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "RELOADING_SANDBOX",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "COMPLETED",
          issues: [],
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
      "
    `);
  });

  it("can not deploy if the maximum number of applications has been reached", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditGraphQLSubscriptions();
    const error = new EditGraphQLError(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION, [
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

  it("exits if the deploy process was interrupted", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const mockEditGraphQL = makeMockEditGraphQLSubscriptions();

    const cause = {
      type: "close",
      code: 4500,
      reason: "Internal Error",
      wasClean: true,
    };

    const error = new EditGraphQLError(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION, cause);

    await deploy(ctx);
    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "NOT_STARTED",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
        },
      },
    });

    await publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
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
});
