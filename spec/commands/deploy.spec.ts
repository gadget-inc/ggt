import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSyncScenario } from "../../spec/__support__/filesync.js";
import { expectProcessExit } from "../../spec/__support__/process.js";
import { expectStdout } from "../../spec/__support__/stream.js";
import { Action, command as deploy } from "../../src/commands/deploy.js";
import { REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION } from "../../src/services/app/edit-graphql.js";
import { Context } from "../../src/services/command/context.js";
import * as prompt from "../../src/services/output/prompt.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { makeMockEditGraphQLSubscriptions } from "../__support__/edit-graphql.js";
import { testDirPath } from "../__support__/paths.js";
import { loginTestUser } from "../__support__/user.js";

describe("deploy", () => {
  let ctx: Context;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();

    ctx = new Context({
      _: [testDirPath("local"), "--app", testApp.slug].map(String),
    });
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

    publishStatus.emitResult({
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
      "╭──────────────────────────────────────────────────────────────────────╮
      │                                                                      │
      │         ggt v0.3.3                                                   │
      │                                                                      │
      │         App         test                                             │
      │         Editor      https://test.gadget.app/edit                     │
      │         Playground  https://test.gadget.app/api/graphql/playground   │
      │         Docs        https://docs.gadget.dev/api/test                 │
      │                                                                      │
      │         Endpoints                                                    │
      │           • https://test.gadget.app                                  │
      │           • https://test--development.gadget.app                     │
      │                                                                      │
      ╰──────────────────────────────────────────────────────────────────────╯

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

    publishStatus.emitResult({
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
      "╭──────────────────────────────────────────────────────────────────────╮
      │                                                                      │
      │         ggt v0.3.3                                                   │
      │                                                                      │
      │         App         test                                             │
      │         Editor      https://test.gadget.app/edit                     │
      │         Playground  https://test.gadget.app/api/graphql/playground   │
      │         Docs        https://docs.gadget.dev/api/test                 │
      │                                                                      │
      │         Endpoints                                                    │
      │           • https://test.gadget.app                                  │
      │           • https://test--development.gadget.app                     │
      │                                                                      │
      ╰──────────────────────────────────────────────────────────────────────╯

      Issues detected

      • Add google keys for production
      "
    `);

    vi.spyOn(prompt, "select").mockResolvedValue(Action.DEPLOY_ANYWAYS);

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "UPLOADING_ASSETS",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "CONVERGING_STORAGE",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "PUBLISHING_TREE",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "RELOADING_SANDBOX",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "COMPLETED",
          issues: [],
        },
      },
    });

    expectStdout().toMatchInlineSnapshot(`
      "╭──────────────────────────────────────────────────────────────────────╮
      │                                                                      │
      │         ggt v0.3.3                                                   │
      │                                                                      │
      │         App         test                                             │
      │         Editor      https://test.gadget.app/edit                     │
      │         Playground  https://test.gadget.app/api/graphql/playground   │
      │         Docs        https://docs.gadget.dev/api/test                 │
      │                                                                      │
      │         Endpoints                                                    │
      │           • https://test.gadget.app                                  │
      │           • https://test--development.gadget.app                     │
      │                                                                      │
      ╰──────────────────────────────────────────────────────────────────────╯

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

    mockEditGraphQL.mockInitialResult(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION, {
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "NOT_STARTED",
          issues: [],
        },
      },
    });

    await deploy(ctx);
    const publishStatus = mockEditGraphQL.expectSubscription(REMOTE_SERVER_CONTRACT_STATUS_SUBSCRIPTION);

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "STARTING",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "BUILDING_ASSETS",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "UPLOADING_ASSETS",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "CONVERGING_STORAGE",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "PUBLISHING_TREE",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "RELOADING_SANDBOX",
          issues: [],
        },
      },
    });

    publishStatus.emitResult({
      data: {
        publishStatus: {
          remoteFilesVersion: "1",
          progress: "COMPLETED",
          issues: [],
        },
      },
    });

    expectStdout().toMatchInlineSnapshot(`
      "╭──────────────────────────────────────────────────────────────────────╮
      │                                                                      │
      │         ggt v0.3.3                                                   │
      │                                                                      │
      │         App         test                                             │
      │         Editor      https://test.gadget.app/edit                     │
      │         Playground  https://test.gadget.app/api/graphql/playground   │
      │         Docs        https://docs.gadget.dev/api/test                 │
      │                                                                      │
      │         Endpoints                                                    │
      │           • https://test.gadget.app                                  │
      │           • https://test--development.gadget.app                     │
      │                                                                      │
      ╰──────────────────────────────────────────────────────────────────────╯

      Building frontend assets ...

      Setting up database ...

      Copying development ...

      Restarting app ...

      Deploy completed. Good bye!
      "
    `);
  });

});
