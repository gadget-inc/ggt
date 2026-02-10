import type { Sink } from "graphql-ws";
import type { JsonObject } from "type-fest";

import { GraphQLError } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Environment } from "../../../src/services/app/app.js";
import type { GraphQLSubscription } from "../../../src/services/app/edit/operation.js";

import { Client } from "../../../src/services/app/client.js";
import { ClientError } from "../../../src/services/app/error.js";
import { testCtx } from "../../__support__/context.js";
import { loginTestUser } from "../../__support__/user.js";

const mockSubscription = "subscription { test }" as GraphQLSubscription<JsonObject, JsonObject>;

const mockEnvironment: Environment = {
  id: 1n,
  name: "development",
  type: "development",
  application: {
    id: 1n,
    slug: "test-app",
    primaryDomain: "test-app.gadget.app",
    environments: [],
    team: { id: 1n, name: "test-team" },
  },
};

describe("Client.subscribe", () => {
  let fakeGraphqlWsClient: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  let capturedSinks: Sink[];
  let onConnectedCleanups: ReturnType<typeof vi.fn>[];

  beforeEach(() => {
    loginTestUser();

    capturedSinks = [];
    onConnectedCleanups = [];

    fakeGraphqlWsClient = {
      on: vi.fn((event: string, _listener: unknown) => {
        if (event === "connected") {
          const cleanup = vi.fn();
          onConnectedCleanups.push(cleanup);
          return cleanup;
        }
        return vi.fn();
      }),
      subscribe: vi.fn((_payload: unknown, sink: Sink) => {
        capturedSinks.push(sink);
        return vi.fn();
      }),
      dispose: vi.fn(),
    };
  });

  const createClientWithFakeWs = (): Client => {
    const client = Object.create(Client.prototype) as Client;
    // Set up minimal properties that the subscribe method needs
    Object.defineProperty(client, "ctx", { value: testCtx.child({ name: "client" }), writable: true });
    Object.defineProperty(client, "environment", { value: mockEnvironment, writable: true });
    Object.defineProperty(client, "endpoint", { value: "/edit/api/graphql-ws", writable: true });
    Object.defineProperty(client, "status", { value: 0, writable: true }); // ConnectionStatus.CONNECTED
    // oxlint-disable-next-line no-explicit-any
    (client as any)._graphqlWsClient = fakeGraphqlWsClient;
    // oxlint-disable-next-line no-explicit-any
    (client as any)._sessionUpdateInterval = undefined;
    return client;
  };

  it("re-adds connected listener after resubscribe from onError", async () => {
    const client = createClientWithFakeWs();

    const clientSub = client.subscribe(testCtx, {
      subscription: mockSubscription,
      onData: vi.fn(),
      onError: () => {
        clientSub.resubscribe();
      },
    });

    // The initial subscribe should have registered one connected listener
    expect(onConnectedCleanups).toHaveLength(1);

    // Emit a non-retryable error via the captured sink to trigger onError → resubscribe
    const sink = capturedSinks[0]!;
    sink.error(new Error("Unauthenticated"));

    // Wait for the async error handler queue to process
    await vi.waitFor(() => {
      // After resubscribe, a new connected listener should have been added
      expect(onConnectedCleanups).toHaveLength(2);
    });
  });

  it("removes old connected listener before adding new one in resubscribe", async () => {
    const client = createClientWithFakeWs();

    const clientSub = client.subscribe(testCtx, {
      subscription: mockSubscription,
      onData: vi.fn(),
      onError: () => {
        clientSub.resubscribe();
      },
    });

    expect(onConnectedCleanups).toHaveLength(1);
    const initialCleanup = onConnectedCleanups[0]!;
    expect(initialCleanup).not.toHaveBeenCalled();

    // Emit a non-retryable error to trigger onError → resubscribe
    const sink = capturedSinks[0]!;
    sink.error(new Error("Unauthenticated"));

    // Wait for the resubscribe to complete
    await vi.waitFor(() => {
      expect(onConnectedCleanups).toHaveLength(2);
    });

    // The old cleanup function should have been called (listener was removed before re-adding)
    expect(initialCleanup).toHaveBeenCalled();
  });

  it("calls onData for valid responses", async () => {
    const client = createClientWithFakeWs();
    const onData = vi.fn();

    client.subscribe(testCtx, {
      subscription: mockSubscription,
      onData,
      onError: vi.fn(),
    });

    const sink = capturedSinks[0]!;
    sink.next({ data: { foo: "bar" } });

    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledWith({ foo: "bar" });
    });
  });

  it("calls onError for responses missing data", async () => {
    const client = createClientWithFakeWs();
    const onError = vi.fn();

    client.subscribe(testCtx, {
      subscription: mockSubscription,
      onData: vi.fn(),
      onError,
    });

    const sink = capturedSinks[0]!;
    sink.next({ data: undefined });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(ClientError));
    });
  });

  it("resubscribe() with new variables updates the payload", async () => {
    const client = createClientWithFakeWs();

    const clientSub = client.subscribe(testCtx, {
      subscription: mockSubscription,
      variables: { version: 1 },
      onData: vi.fn(),
      onError: vi.fn(),
    });

    // Verify initial subscribe was called with original variables
    expect(fakeGraphqlWsClient.subscribe).toHaveBeenCalledTimes(1);
    expect(fakeGraphqlWsClient.subscribe.mock.calls[0]![0]).toEqual({
      query: mockSubscription,
      variables: { version: 1 },
    });

    clientSub.resubscribe(() => ({ version: 2 }));

    // Should have been called again with updated variables
    expect(fakeGraphqlWsClient.subscribe).toHaveBeenCalledTimes(2);
    expect(fakeGraphqlWsClient.subscribe.mock.calls[1]![0]).toEqual({
      query: mockSubscription,
      variables: { version: 2 },
    });
  });

  describe("retry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("schedules retry on retryable errors", async () => {
      const client = createClientWithFakeWs();
      const onError = vi.fn();
      const onRetry = vi.fn();

      client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData: vi.fn(),
        onError,
        retry: { maxAttempts: 3, onRetry },
      });

      // Emit a retryable error (network error)
      const sink = capturedSinks[0]!;
      const networkError = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink.error(networkError);

      // Let the queue process
      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledWith(1, expect.any(ClientError));
      });

      // onError should NOT have been called — we're retrying
      expect(onError).not.toHaveBeenCalled();

      // Advance timers to trigger the retry timeout
      await vi.advanceTimersByTimeAsync(10_000);

      // After retry fires, a new subscription should have been created (resubscribe)
      expect(fakeGraphqlWsClient.subscribe).toHaveBeenCalledTimes(2);
    });

    it("stops after maxAttempts", async () => {
      const client = createClientWithFakeWs();
      const onError = vi.fn();
      const onRetry = vi.fn();

      client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData: vi.fn(),
        onError,
        retry: { maxAttempts: 1, onRetry },
      });

      // First retryable error — should schedule retry
      const sink0 = capturedSinks[0]!;
      const networkError1 = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink0.error(networkError1);

      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(1);
      });

      // Advance timers to trigger the resubscribe
      await vi.advanceTimersByTimeAsync(10_000);

      // Second retryable error — should exhaust budget and call onError
      const sink1 = capturedSinks[1]!;
      const networkError2 = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink1.error(networkError2);

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(ClientError));
      });

      // onRetry should NOT have been called again
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("resets count on successful data", async () => {
      const client = createClientWithFakeWs();
      const onData = vi.fn();
      const onRetry = vi.fn();

      client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData,
        onError: vi.fn(),
        retry: { maxAttempts: 2, onRetry },
      });

      // First retryable error
      const sink0 = capturedSinks[0]!;
      const networkError = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink0.error(networkError);

      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(1);
      });

      // Advance timers to trigger the resubscribe
      await vi.advanceTimersByTimeAsync(10_000);

      // Successful data on the new subscription should reset retry count
      const sink1 = capturedSinks[1]!;
      sink1.next({ data: { foo: "bar" } });

      await vi.waitFor(() => {
        expect(onData).toHaveBeenCalledWith({ foo: "bar" });
      });

      // Now another retryable error — should be allowed because count was reset
      const networkError2 = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink1.error(networkError2);

      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(2);
      });
    });

    it("skips retry when no retry option provided", async () => {
      const client = createClientWithFakeWs();
      const onError = vi.fn();

      client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData: vi.fn(),
        onError,
        // No retry option
      });

      // Emit a retryable error
      const sink = capturedSinks[0]!;
      const networkError = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink.error(networkError);

      // Should immediately call onError
      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(ClientError));
      });

      // Should NOT have resubscribed
      expect(fakeGraphqlWsClient.subscribe).toHaveBeenCalledTimes(1);
    });

    it("unsubscribe() clears pending retry timeout", async () => {
      const client = createClientWithFakeWs();
      const onRetry = vi.fn();

      const clientSub = client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData: vi.fn(),
        onError: vi.fn(),
        retry: { maxAttempts: 3, onRetry },
      });

      // Emit a retryable error to schedule a retry
      const sink = capturedSinks[0]!;
      const networkError = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink.error(networkError);

      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(1);
      });

      // Unsubscribe before the retry timeout fires
      clientSub.unsubscribe();

      // Advance timers past where the retry would have fired
      await vi.advanceTimersByTimeAsync(10_000);

      // Should NOT have resubscribed
      expect(fakeGraphqlWsClient.subscribe).toHaveBeenCalledTimes(1);
    });

    it("does not retry GraphQL errors with response errors", async () => {
      const client = createClientWithFakeWs();
      const onError = vi.fn();

      client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData: vi.fn(),
        onError,
        retry: { maxAttempts: 3 },
      });

      // Emit a response with auth-related GraphQL errors (non-retryable)
      const sink = capturedSinks[0]!;
      sink.next({ errors: [new GraphQLError("Unauthenticated")] });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(ClientError));
      });

      // Should NOT have resubscribed
      expect(fakeGraphqlWsClient.subscribe).toHaveBeenCalledTimes(1);
    });

    it("doUnsubscribe() clears pending retry on fatal error", async () => {
      const client = createClientWithFakeWs();
      const onError = vi.fn();
      const onRetry = vi.fn();

      client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData: vi.fn(),
        onError,
        retry: { maxAttempts: 3, onRetry },
      });

      // Emit a retryable error to schedule a retry
      const sink = capturedSinks[0]!;
      const networkError = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink.error(networkError);

      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(1);
      });

      // Now emit a non-retryable (fatal) error on the same sink — triggers doUnsubscribe()
      sink.error(new Error("Unauthenticated"));

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(ClientError));
      });

      // Advance timers well past where the retry would have fired
      await vi.advanceTimersByTimeAsync(10_000);

      // The retry timeout should have been cleared — no ghost resubscribe
      expect(fakeGraphqlWsClient.subscribe).toHaveBeenCalledTimes(1);
    });

    it("doUnsubscribe() clears pending retry on response missing data", async () => {
      const client = createClientWithFakeWs();
      const onError = vi.fn();
      const onRetry = vi.fn();

      client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData: vi.fn(),
        onError,
        retry: { maxAttempts: 3, onRetry },
      });

      // Emit a retryable error to schedule a retry
      const sink = capturedSinks[0]!;
      const networkError = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink.error(networkError);

      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(1);
      });

      // Emit a response missing data — triggers doUnsubscribe() through onResponse path
      sink.next({ data: undefined });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(ClientError));
      });

      // Advance timers well past where the retry would have fired
      await vi.advanceTimersByTimeAsync(10_000);

      // The retry timeout should have been cleared — no ghost resubscribe
      expect(fakeGraphqlWsClient.subscribe).toHaveBeenCalledTimes(1);
    });

    it("onComplete() clears pending retry", async () => {
      const client = createClientWithFakeWs();
      const onComplete = vi.fn();
      const onRetry = vi.fn();

      client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData: vi.fn(),
        onError: vi.fn(),
        onComplete,
        retry: { maxAttempts: 3, onRetry },
      });

      // Emit a retryable error to schedule a retry
      const sink = capturedSinks[0]!;
      const networkError = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink.error(networkError);

      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(1);
      });

      // Complete the subscription while retry is pending
      sink.complete();

      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      });

      // Advance timers well past where the retry would have fired
      await vi.advanceTimersByTimeAsync(10_000);

      // The retry timeout should have been cleared — no ghost resubscribe
      expect(fakeGraphqlWsClient.subscribe).toHaveBeenCalledTimes(1);
    });

    it("multiple retryable errors before timeout do not exhaust budget", async () => {
      vi.useRealTimers();

      const client = createClientWithFakeWs();
      const onError = vi.fn();
      const onRetry = vi.fn();

      client.subscribe(testCtx, {
        subscription: mockSubscription,
        onData: vi.fn(),
        onError,
        retry: { maxAttempts: 2, onRetry },
      });

      // Emit first retryable error — increments retryCount to 1
      const sink0 = capturedSinks[0]!;
      const networkError1 = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink0.error(networkError1);

      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(1);
      });

      // Emit second retryable error before retry timeout fires —
      // retryTimeoutId is set so retryCount stays at 1 (not incremented to 2)
      const networkError2 = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
      sink0.error(networkError2);

      await vi.waitFor(() => {
        expect(onRetry).toHaveBeenCalledTimes(2);
      });

      // Both calls should report attempt 1 (count not double-incremented)
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(ClientError));
      expect(onRetry).toHaveBeenNthCalledWith(2, 1, expect.any(ClientError));

      // Budget should NOT be exhausted — without the guard, retryCount
      // would be 2 (>= maxAttempts) and onError would be called
      expect(onError).not.toHaveBeenCalled();
    });
  });
});
