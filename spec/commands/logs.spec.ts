import { beforeEach, describe, expect, it, vi } from "vitest";

import * as logs from "../../src/commands/logs.js";
import { ENVIRONMENT_LOGS_SUBSCRIPTION, type GraphQLSubscription } from "../../src/services/app/edit/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { mockContext, testCtx } from "../__support__/context.js";
import { withEnv } from "../__support__/env.js";
import { expectError } from "../__support__/error.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { makeMockEditSubscriptions, type MockEditSubscriptions } from "../__support__/graphql.js";
import { expectStdout, mockStdout } from "../__support__/output.js";
import { timeoutMs } from "../__support__/sleep.js";
import { loginTestUser } from "../__support__/user.js";

describe("logs", () => {
  mockStdout();
  mockContext();

  const waitForSubscription = async (
    mockEditGraphQL: MockEditSubscriptions,
    subscription: GraphQLSubscription,
  ): Promise<ReturnType<MockEditSubscriptions["expectSubscription"]>> => {
    return vi.waitFor(() => mockEditGraphQL.expectSubscription(subscription), {
      timeout: timeoutMs("5s"),
      interval: 10,
    });
  };

  const now = 1753120882299;
  const logTimestamp = (now * 1_000_000).toString();

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

  const v2EmptySubscriptionResponse = {
    data: {
      logsSearchV2: {
        status: "ok",
        data: {
          messages: [],
        },
      },
    },
  };

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  describe("default (one-shot)", () => {
    it("prints server logs and exits", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs");
      const mockEditGraphQL = makeMockEditSubscriptions();

      const runPromise = logs.run(testCtx, args);
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);
      await logsSub.emitResponse(v2SubscriptionResponse);
      await runPromise;

      expectStdout().toMatchInlineSnapshot(`
      "06:01:22  INFO  my-app: hello from server!
        foo: bar
      "
      `);
    });

    it("prints server logs in JSON format with --json", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs", "--json");
      const mockEditGraphQL = makeMockEditSubscriptions();

      await withEnv({ GGT_LOG_FORMAT: "json" }, async () => {
        const runPromise = logs.run(testCtx, args);
        const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);
        await logsSub.emitResponse(v2SubscriptionResponse);
        await runPromise;

        expectStdout().toMatchInlineSnapshot(`
          "{"level":3,"name":"my-app","msg":"hello from server!","fields":{"foo":"bar"}}
          "
        `);
      });
    });

    it("prints nothing when there are no logs", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs");
      const mockEditGraphQL = makeMockEditSubscriptions();

      const runPromise = logs.run(testCtx, args);
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);
      await logsSub.emitResponse(v2EmptySubscriptionResponse);
      await runPromise;

      expectStdout().toMatchInlineSnapshot(`""`);
    });

    it("defaults --start to approximately 5 minutes ago", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs");
      const mockEditGraphQL = makeMockEditSubscriptions();

      const before = Date.now() - 5 * 60 * 1000;
      const runPromise = logs.run(testCtx, args);
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);

      expect(logsSub.variables).toHaveProperty("start");
      const start = logsSub.variables!["start"];
      expect(start).toBeInstanceOf(Date);

      const startDate = start as unknown as Date;
      expect(startDate.getTime()).toBeGreaterThanOrEqual(before - 2_000);
      expect(startDate.getTime()).toBeLessThanOrEqual(Date.now());

      await logsSub.emitResponse(v2EmptySubscriptionResponse);
      await runPromise;
    });

    it("passes --start through to subscription variables", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs", "--start", "2025-01-01T00:00:00Z");
      const mockEditGraphQL = makeMockEditSubscriptions();

      const runPromise = logs.run(testCtx, args);
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);
      expect(logsSub.variables!["start"]).toEqual(new Date("2025-01-01T00:00:00Z"));

      await logsSub.emitResponse(v2EmptySubscriptionResponse);
      await runPromise;
    });

    it("passes --my-logs as query filter", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs", "--my-logs");
      const mockEditGraphQL = makeMockEditSubscriptions();

      const runPromise = logs.run(testCtx, args);
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);
      expect(String(logsSub.variables!["query"])).toContain('source="user"');

      await logsSub.emitResponse(v2EmptySubscriptionResponse);
      await runPromise;
    });

    it("passes --level as query filter", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs", "--level", "warn");
      const mockEditGraphQL = makeMockEditSubscriptions();

      const runPromise = logs.run(testCtx, args);
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);
      expect(String(logsSub.variables!["query"])).toContain('level=~"warn|error"');

      await logsSub.emitResponse(v2EmptySubscriptionResponse);
      await runPromise;
    });
  });

  describe("validation", () => {
    it("rejects invalid --level", () => {
      expect(() => makeArgs(logs.args, "logs", "--level", "verbose")).toThrow(ArgError);
    });

    it("rejects invalid --start date", () => {
      expect(() => makeArgs(logs.args, "logs", "--start", "not-a-date")).toThrow(ArgError);
    });
  });

  describe("--follow", () => {
    it("streams server logs continuously via subscription", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs", "--follow");
      const mockEditGraphQL = makeMockEditSubscriptions();

      const runPromise = logs.run(testCtx, args);
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);

      expect(logsSub.variables).toHaveProperty("start");
      expect(logsSub.variables!["start"]).toBeInstanceOf(Date);

      await logsSub.emitResponse(v2SubscriptionResponse);
      await runPromise;

      expectStdout().toMatchInlineSnapshot(`
      "06:01:22  INFO  my-app: hello from server!
        foo: bar
      "
      `);
    });

    it("supports -f as alias for --follow", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs", "-f");
      const mockEditGraphQL = makeMockEditSubscriptions();

      const runPromise = logs.run(testCtx, args);
      const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);
      await logsSub.emitResponse(v2SubscriptionResponse);
      await runPromise;

      expectStdout().toMatchInlineSnapshot(`
      "06:01:22  INFO  my-app: hello from server!
        foo: bar
      "
      `);
    });

    it("streams server logs in JSON format with --json", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const args = makeArgs(logs.args, "logs", "--follow", "--json");
      const mockEditGraphQL = makeMockEditSubscriptions();

      await withEnv({ GGT_LOG_FORMAT: "json" }, async () => {
        const runPromise = logs.run(testCtx, args);
        const logsSub = await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);
        await logsSub.emitResponse(v2SubscriptionResponse);
        await runPromise;

        expectStdout().toMatchInlineSnapshot(`
          "{"level":3,"name":"my-app","msg":"hello from server!","fields":{"foo":"bar"}}
          "
        `);
      });
    });
  });

  it("handles abort in one-shot mode", async () => {
    await makeSyncScenario({ localFiles: { ".gadget/": "" } });

    const args = makeArgs(logs.args, "logs");
    const mockEditGraphQL = makeMockEditSubscriptions();

    const runPromise = logs.run(testCtx, args);
    await waitForSubscription(mockEditGraphQL, ENVIRONMENT_LOGS_SUBSCRIPTION);

    const error = await expectError(async () => {
      testCtx.abort(new Error("stopped"));
      await runPromise;
    });

    expect(error.message).toContain("stopped");
  });
});
