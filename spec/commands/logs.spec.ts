import { beforeEach, describe, it } from "vitest";
import * as logs from "../../src/commands/logs.js";
import { ENVIRONMENT_LOGS_SUBSCRIPTION, type GraphQLSubscription } from "../../src/services/app/edit/operation.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { mockContext, testCtx } from "../__support__/context.js";
import { withEnv } from "../__support__/env.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { makeMockEditSubscriptions, type MockEditSubscriptions } from "../__support__/graphql.js";
import { expectStdout, mockStdout } from "../__support__/output.js";
import { loginTestUser } from "../__support__/user.js";

describe("logs", () => {
  mockStdout();
  mockContext();

  // Helper to wait for a subscription to be registered
  const waitForSubscription = async (
    mockEditGraphQL: MockEditSubscriptions,
    subscription: GraphQLSubscription,
  ): Promise<ReturnType<MockEditSubscriptions["expectSubscription"]>> => {
    for (let i = 0; i < 50; i++) {
      try {
        return mockEditGraphQL.expectSubscription(subscription);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    throw new Error("Subscription was not registered in time");
  };

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("prints server logs to the console via subscription", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
    });

    const args = makeArgs(logs.args, "logs");
    const mockEditGraphQL = makeMockEditSubscriptions();

    // Simulate the server sending a log message
    const logMessage = {
      msg: "hello from server!",
      name: "my-app",
      level: "info",
      foo: "bar",
    };
    const now = 1753120882299;
    const logTimestamp = (now * 1_000_000).toString();

    // Start the logs command (which will subscribe asynchronously)
    const runPromise = logs.run(testCtx, args);

    // Wait for the subscription to be registered
    const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);

    // Emit a log message
    await logsSub.emitResponse({
      data: {
        logsSearchV2: {
          status: "ok",
          data: {
            messages: [[logTimestamp, JSON.stringify(logMessage)]],
          },
        },
      },
    });

    await runPromise;

    expectStdout().toMatchInlineSnapshot(`
    "06:01:22  INFO  my-app: hello from server!
      foo: bar
    "
    `);
  });

  it("prints server logs to the console in JSON format with --json", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
    });

    const args = makeArgs(logs.args, "logs", "--json");
    const mockEditGraphQL = makeMockEditSubscriptions();

    await withEnv({ GGT_LOG_FORMAT: "json" }, async () => {
      // Use the same fixed timestamp and log message as the pretty test
      const now = 1753120882299;
      const logMessage = {
        msg: "hello from server!",
        name: "my-app",
        level: "info",
        foo: "bar",
      };
      const logTimestamp = (now * 1_000_000).toString();

      // Start the logs command (which will subscribe asynchronously)
      const runPromise = logs.run(testCtx, args);

      // Wait for the subscription to be registered
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);

      // Emit a log message
      await logsSub.emitResponse({
        data: {
          logsSearchV2: {
            status: "ok",
            data: {
              messages: [[logTimestamp, JSON.stringify(logMessage)]],
            },
          },
        },
      });

      await runPromise;

      expectStdout().toMatchInlineSnapshot(`
        "{"level":3,"name":"my-app","msg":"hello from server!","fields":{"foo":"bar"}}
        "
      `);
    });
  });
});
