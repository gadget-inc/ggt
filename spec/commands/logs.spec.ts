import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import * as logs from "../../src/commands/logs.js";
import {
  ENVIRONMENT_LOGS_SUBSCRIPTION,
  LOGS_SEARCH_V3_QUERY,
  type GraphQLSubscription,
  type LogRow,
} from "../../src/services/app/edit/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { mockContext, testCtx } from "../__support__/context.js";
import { withEnv } from "../__support__/env.js";
import { expectError } from "../__support__/error.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { makeMockEditSubscriptions, nockEditResponse, type MockEditSubscriptions } from "../__support__/graphql.js";
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

  // Permissive schema for tests that don't validate specific variables
  const anyVariables = z.record(z.string(), z.unknown());

  const now = 1753120882299;
  const logTimestamp = (now * 1_000_000).toString();

  const logRow: LogRow = {
    name: "my-app",
    timestampNanos: logTimestamp,
    level: "info",
    message: "hello from server!",
    labels: { foo: "bar" },
  };

  const v3SuccessResponse = {
    data: {
      logsSearchV3: {
        __typename: "LogSearchSuccessResult",
        data: [logRow],
      },
    },
  };

  const v3EmptyResponse = {
    data: {
      logsSearchV3: {
        __typename: "LogSearchSuccessResult",
        data: [],
      },
    },
  };

  // V2 subscription response format (used for --tail)
  const logMessage = {
    msg: "hello from server!",
    name: "my-app",
    level: "info",
    foo: "bar",
  };

  const v2SubscriptionResponse = {
    data: {
      logsSearchV2: {
        status: "ok",
        data: {
          messages: [[logTimestamp, JSON.stringify(logMessage)]],
        },
      },
    },
  };

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  describe("default (one-shot query)", () => {
    it("prints server logs and exits", async () => {
      await makeSyncScenario({
        localFiles: {
          ".gadget/": "",
        },
      });

      const scope = nockEditResponse({
        operation: LOGS_SEARCH_V3_QUERY,
        response: v3SuccessResponse,
        expectVariables: anyVariables,
      });

      const args = makeArgs(logs.args, "logs");
      await logs.run(testCtx, args);

      expect(scope.isDone()).toBe(true);

      expectStdout().toMatchInlineSnapshot(`
      "06:01:22  INFO  my-app: hello from server!
        foo: bar
      "
      `);
    });

    it("prints server logs in JSON format with --json", async () => {
      await makeSyncScenario({
        localFiles: {
          ".gadget/": "",
        },
      });

      nockEditResponse({
        operation: LOGS_SEARCH_V3_QUERY,
        response: v3SuccessResponse,
        expectVariables: anyVariables,
      });

      const args = makeArgs(logs.args, "logs", "--json");

      await withEnv({ GGT_LOG_FORMAT: "json" }, async () => {
        await logs.run(testCtx, args);

        expectStdout().toMatchInlineSnapshot(`
          "{"level":3,"name":"my-app","msg":"hello from server!","fields":{"foo":"bar"}}
          "
        `);
      });
    });

    it("prints nothing when there are no logs", async () => {
      await makeSyncScenario({
        localFiles: {
          ".gadget/": "",
        },
      });

      nockEditResponse({
        operation: LOGS_SEARCH_V3_QUERY,
        response: v3EmptyResponse,
        expectVariables: anyVariables,
      });

      const args = makeArgs(logs.args, "logs");
      await logs.run(testCtx, args);

      expectStdout().toMatchInlineSnapshot(`""`);
    });

    it("passes --start, --end, --direction, and --level to the query", async () => {
      await makeSyncScenario({
        localFiles: {
          ".gadget/": "",
        },
      });

      const scope = nockEditResponse({
        operation: LOGS_SEARCH_V3_QUERY,
        response: v3SuccessResponse,
        expectVariables: z.object({
          query: z.string(),
          start: z.literal("2025-01-01T00:00:00.000Z"),
          end: z.literal("2025-01-02T00:00:00.000Z"),
          direction: z.literal("forward"),
          level: z.literal(40),
        }),
      });

      const args = makeArgs(
        logs.args,
        "logs",
        "--start",
        "2025-01-01T00:00:00Z",
        "--end",
        "2025-01-02T00:00:00Z",
        "--direction",
        "forward",
        "--level",
        "warn",
      );
      await logs.run(testCtx, args);

      expect(scope.isDone()).toBe(true);
    });

    it("defaults --start to 5 minutes ago", async () => {
      await makeSyncScenario({
        localFiles: {
          ".gadget/": "",
        },
      });

      const before = new Date(Date.now() - 5 * 60 * 1000);

      nockEditResponse({
        operation: LOGS_SEARCH_V3_QUERY,
        response: v3SuccessResponse,
        expectVariables: z.object({
          query: z.string(),
          start: z.string().refine((s) => {
            const startDate = new Date(s);
            return startDate.getTime() >= before.getTime() && startDate.getTime() <= Date.now();
          }, "start should be approximately 5 minutes ago"),
        }),
      });

      const args = makeArgs(logs.args, "logs");
      await logs.run(testCtx, args);
    });

    it("passes --my-logs as query filter", async () => {
      await makeSyncScenario({
        localFiles: {
          ".gadget/": "",
        },
      });

      nockEditResponse({
        operation: LOGS_SEARCH_V3_QUERY,
        response: v3SuccessResponse,
        expectVariables: z.object({
          query: z.literal('source:"user"'),
          start: z.string(),
        }),
      });

      const args = makeArgs(logs.args, "logs", "--my-logs");
      await logs.run(testCtx, args);
    });
  });

  describe("validation", () => {
    it("rejects --end before --start", async () => {
      await makeSyncScenario({
        localFiles: {
          ".gadget/": "",
        },
      });

      const args = makeArgs(logs.args, "logs", "--start", "2025-01-02T00:00:00Z", "--end", "2025-01-01T00:00:00Z");
      const error = await expectError(() => logs.run(testCtx, args));
      expect(error).toBeInstanceOf(ArgError);
      expect(error.message).toContain("--end cannot be before --start");
    });

    it("rejects invalid --direction", () => {
      expect(() => makeArgs(logs.args, "logs", "--direction", "sideways")).toThrow(ArgError);
    });

    it("rejects invalid --level", () => {
      expect(() => makeArgs(logs.args, "logs", "--level", "verbose")).toThrow(ArgError);
    });

    it("rejects invalid --start date", () => {
      expect(() => makeArgs(logs.args, "logs", "--start", "not-a-date")).toThrow(ArgError);
    });
  });

  describe("--tail", () => {
    it("streams server logs continuously via subscription", async () => {
      await makeSyncScenario({
        localFiles: {
          ".gadget/": "",
        },
      });

      const args = makeArgs(logs.args, "logs", "--tail");
      const mockEditGraphQL = makeMockEditSubscriptions();

      // Start the logs command (which will subscribe asynchronously)
      const runPromise = logs.run(testCtx, args);

      // Wait for the subscription to be registered
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);

      // Tail mode should pass start to stream from now
      expect(logsSub.variables).toHaveProperty("start");
      expect(logsSub.variables!["start"]).toBeInstanceOf(Date);

      // Emit a log message
      await logsSub.emitResponse(v2SubscriptionResponse);

      await runPromise;

      expectStdout().toMatchInlineSnapshot(`
      "06:01:22  INFO  my-app: hello from server!
        foo: bar
      "
      `);
    });

    it("streams server logs in JSON format with --json", async () => {
      await makeSyncScenario({
        localFiles: {
          ".gadget/": "",
        },
      });

      const args = makeArgs(logs.args, "logs", "--tail", "--json");
      const mockEditGraphQL = makeMockEditSubscriptions();

      await withEnv({ GGT_LOG_FORMAT: "json" }, async () => {
        // Start the logs command (which will subscribe asynchronously)
        const runPromise = logs.run(testCtx, args);

        // Wait for the subscription to be registered
        const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);

        // Emit a log message
        await logsSub.emitResponse(v2SubscriptionResponse);

        await runPromise;

        expectStdout().toMatchInlineSnapshot(`
          "{"level":3,"name":"my-app","msg":"hello from server!","fields":{"foo":"bar"}}
          "
        `);
      });
    });
  });
});
