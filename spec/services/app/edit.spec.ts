import type { CloseEvent, ErrorEvent } from "ws";

import { GraphQLError } from "graphql";
import nock from "nock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Client } from "../../../src/services/app/client.js";
import { Edit } from "../../../src/services/app/edit/edit.js";
import {
  PUBLISH_FILE_SYNC_EVENTS_MUTATION,
  REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
  REMOTE_FILES_VERSION_QUERY,
  type GraphQLQuery,
} from "../../../src/services/app/edit/operation.js";
import { ClientError } from "../../../src/services/app/error.js";
import { config } from "../../../src/services/config/config.js";
import { loadCookie } from "../../../src/services/http/auth.js";
import { testApp, testEnvironment } from "../../__support__/app.js";
import { testCtx } from "../../__support__/context.js";
import { expectError } from "../../__support__/error.js";
import { makeMockEditSubscriptions, nockEditResponse } from "../../__support__/graphql.js";
import { loginTestUser } from "../../__support__/user.js";

describe("Edit", () => {
  beforeEach(() => {
    loginTestUser();
  });

  it("retries queries when it receives a 500", async () => {
    const scope = nockEditResponse({
      operation: REMOTE_FILES_VERSION_QUERY,
      response: {},
      times: 2,
      statusCode: 500,
    });

    nockEditResponse({
      operation: REMOTE_FILES_VERSION_QUERY,
      response: {
        data: {
          remoteFilesVersion: "1",
        },
      },
    });

    const edit = new Edit(testCtx, testEnvironment);

    await expect(edit.query({ query: REMOTE_FILES_VERSION_QUERY })).resolves.not.toThrow();

    expect(scope.isDone()).toBe(true);
  });

  it("throws EditError when it receives errors", async () => {
    nockEditResponse({
      operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: {
        errors: [new GraphQLError("Something went wrong")],
      },
    });

    const edit = new Edit(testCtx, testEnvironment);

    const error: ClientError = await expectError(() => edit.mutate({ mutation: PUBLISH_FILE_SYNC_EVENTS_MUTATION }));
    expect(error).toBeInstanceOf(ClientError);
    expect(error.cause).toEqual([{ message: "Something went wrong" }]);
  });

  it("throws EditError when it receives a 500", async () => {
    nockEditResponse({
      operation: PUBLISH_FILE_SYNC_EVENTS_MUTATION,
      response: {
        errors: [new GraphQLError("Something went wrong")],
      },
      statusCode: 500,
    });

    const editGraphQL = new Edit(testCtx, testEnvironment);

    const error: ClientError = await expectError(() => editGraphQL.mutate({ mutation: PUBLISH_FILE_SYNC_EVENTS_MUTATION }));
    expect(error).toBeInstanceOf(ClientError);
    expect(error.cause).toEqual([{ message: "Something went wrong" }]);
  });

  it("throws EditError when it receives invalid json", async () => {
    nock(`https://${testApp.slug}--development.${config.domains.app}`)
      .post("/edit/api/graphql")
      .matchHeader("cookie", (cookie) => loadCookie(testCtx) === cookie)
      .reply(503, "Service Unavailable", { "content-type": "text/plain" });

    const editGraphQL = new Edit(testCtx, testEnvironment);

    const error: ClientError = await expectError(() => editGraphQL.mutate({ mutation: PUBLISH_FILE_SYNC_EVENTS_MUTATION }));
    expect(error).toBeInstanceOf(ClientError);
    expect(error.cause).toEqual("Service Unavailable");
  });
});

describe("Edit.subscribe", () => {
  beforeEach(() => {
    loginTestUser();
  });

  it("passes retry options to Client.subscribe", () => {
    const subscribeSpy = vi.spyOn(Client.prototype, "subscribe").mockReturnValue({
      unsubscribe: vi.fn(),
      resubscribe: vi.fn(),
    });

    const edit = new Edit(testCtx, testEnvironment);
    const onRetry = vi.fn();

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData: vi.fn(),
      onError: vi.fn(),
      retry: { maxAttempts: 5, onRetry },
    });

    expect(subscribeSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
        variables: { localFilesVersion: "1" },
        retry: { maxAttempts: 5, onRetry },
      }),
    );

    subscribeSpy.mockRestore();
  });
});

describe("Edit.subscribe retry", () => {
  beforeEach(() => {
    loginTestUser();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries on transient GraphQL errors", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 3, onRetry },
    });

    // Initial subscription
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(1);

    // Emit a transient error
    const sub1 = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub1.emitResponse({ errors: [new GraphQLError("Internal server error")] });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(ClientError));
    expect(onError).not.toHaveBeenCalled();

    // Advance timers to trigger resubscription
    await vi.runAllTimersAsync();

    // Should have resubscribed
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(2);
  });

  it("does not retry authentication errors", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 3, onRetry },
    });

    const sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({ errors: [new GraphQLError("Unauthenticated")] });

    await vi.runAllTimersAsync();

    expect(onRetry).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(1);
  });

  it("stops retrying after max attempts", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 2, onRetry },
    });

    // First error - should retry
    let sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    await vi.runAllTimersAsync();
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Second error - should retry (last attempt)
    sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    await vi.runAllTimersAsync();
    expect(onRetry).toHaveBeenCalledTimes(2);

    // Third error - should NOT retry (max attempts reached)
    sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    await vi.runAllTimersAsync();

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(3);
  });

  it("resets retry count on successful data", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 2, onRetry },
    });

    // First error - should retry
    let sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    await vi.runAllTimersAsync();
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Success - should reset retry count
    sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "2",
          changed: [],
          deleted: [],
        },
      },
    });

    expect(onData).toHaveBeenCalledTimes(1);

    // Another error - should retry again (count was reset)
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    await vi.runAllTimersAsync();
    expect(onRetry).toHaveBeenCalledTimes(2);

    // Another error - should retry again
    sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    await vi.runAllTimersAsync();
    expect(onRetry).toHaveBeenCalledTimes(3);

    // Now max attempts reached
    sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    await vi.runAllTimersAsync();

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("re-evaluates variable thunks on resubscription", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onData = vi.fn();
    const onError = vi.fn();

    let version = "1";
    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: () => ({ localFilesVersion: version }),
      onData,
      onError,
      retry: { maxAttempts: 3 },
    });

    // Initial subscription should have version "1"
    let sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    expect(sub.variables).toEqual({ localFilesVersion: "1" });

    // Update version before retry
    version = "2";

    // Trigger error and retry
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    await vi.runAllTimersAsync();

    // New subscription should have version "2"
    sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    expect(sub.variables).toEqual({ localFilesVersion: "2" });
  });

  it("retries on retryable CloseEvent codes", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 3, onRetry },
    });

    const sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // Emit a retryable close event (1006 = abnormal closure)
    await sub.emitError(
      new ClientError(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION, {
        type: "close",
        code: 1006,
        reason: "Abnormal closure",
        wasClean: false,
      } as CloseEvent),
    );

    await vi.runAllTimersAsync();

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(2);
  });

  it("does not retry on normal closure (1000)", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 3, onRetry },
    });

    const sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // Emit a non-retryable close event (1000 = normal closure)
    await sub.emitError(
      new ClientError(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION, {
        type: "close",
        code: 1000,
        reason: "Normal closure",
        wasClean: true,
      } as CloseEvent),
    );

    await vi.runAllTimersAsync();

    expect(onRetry).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(1);
  });

  it("does not retry without retry option", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      // No retry option
    });

    const sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });

    await vi.runAllTimersAsync();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(1);
  });

  it("clears retry timeout on unsubscribe", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    const subscription = edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 3, onRetry },
    });

    const sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });

    expect(onRetry).toHaveBeenCalledTimes(1);

    // Unsubscribe before retry timer fires
    subscription.unsubscribe();

    // Advance timers - should NOT resubscribe
    await vi.runAllTimersAsync();

    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(1);
  });

  it("cancels pending retry timeout when success data arrives before timeout fires", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 3, onRetry },
    });

    const sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // Trigger error - this schedules a retry timeout
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Success arrives BEFORE timeout fires (server recovered quickly)
    await sub.emitResponse({
      data: {
        remoteFileSyncEvents: {
          remoteFilesVersion: "2",
          changed: [],
          deleted: [],
        },
      },
    });
    expect(onData).toHaveBeenCalledTimes(1);

    // Now advance timers - the cancelled timeout should NOT trigger resubscription
    await vi.runAllTimersAsync();

    // Should NOT have resubscribed since success data cancelled the timeout
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(1);
  });

  it("only triggers one resubscription when multiple errors arrive before timeout fires", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 3, onRetry },
    });

    const sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // First error - schedules retry timeout
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Second error arrives BEFORE first timeout fires
    await sub.emitResponse({ errors: [new GraphQLError("Another server error")] });
    expect(onRetry).toHaveBeenCalledTimes(2);

    // Third error arrives BEFORE timeout fires
    await sub.emitResponse({ errors: [new GraphQLError("Yet another error")] });
    expect(onRetry).toHaveBeenCalledTimes(3);

    // Now advance timers - only ONE resubscription should occur
    await vi.runAllTimersAsync();

    // Should have exactly 2 subscriptions (original + 1 resubscription, NOT 4)
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(2);
  });

  it("clears retry timeout on subscription completion", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      onComplete,
      retry: { maxAttempts: 3, onRetry },
    });

    const sub = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // Trigger error - schedules retry timeout
    await sub.emitResponse({ errors: [new GraphQLError("Internal server error")] });
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Complete arrives BEFORE timeout fires
    await sub.emitComplete();
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Advance timers - the cancelled timeout should NOT trigger resubscription
    await vi.runAllTimersAsync();

    // Should NOT have resubscribed
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(1);
  });

  it("preserves retry attempts when multiple errors arrive before timeout fires", async () => {
    const mockSubs = makeMockEditSubscriptions();
    const onRetry = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();

    const edit = new Edit(testCtx, testEnvironment);

    edit.subscribe({
      subscription: REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION,
      variables: { localFilesVersion: "1" },
      onData,
      onError,
      retry: { maxAttempts: 3, onRetry },
    });

    const sub1 = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // Send 3 rapid errors BEFORE any timeout fires
    // Bug: each error would increment retryCount, exhausting the budget
    // Fix: only increment when no retry is pending
    await sub1.emitResponse({ errors: [new GraphQLError("Error 1")] });
    await sub1.emitResponse({ errors: [new GraphQLError("Error 2")] });
    await sub1.emitResponse({ errors: [new GraphQLError("Error 3")] });

    // onRetry should be called for each error
    expect(onRetry).toHaveBeenCalledTimes(3);

    // But the retry count passed should always be 1 (not 1, 2, 3)
    // because only the first error should increment the counter
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(ClientError));
    expect(onRetry).toHaveBeenNthCalledWith(2, 1, expect.any(ClientError));
    expect(onRetry).toHaveBeenNthCalledWith(3, 1, expect.any(ClientError));

    // Let timeout fire - this triggers the first actual resubscription
    await vi.runAllTimersAsync();

    // Should have resubscribed once
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(2);
    const sub2 = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // Send another error on the NEW subscription
    // This should still be allowed because we only used 1 retry attempt
    await sub2.emitResponse({ errors: [new GraphQLError("Error on sub 2")] });

    expect(onRetry).toHaveBeenCalledTimes(4);
    expect(onRetry).toHaveBeenNthCalledWith(4, 2, expect.any(ClientError));
    expect(onError).not.toHaveBeenCalled();

    // Let timeout fire for second resubscription
    await vi.runAllTimersAsync();
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(3);
    const sub3 = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // Third retry should still work
    await sub3.emitResponse({ errors: [new GraphQLError("Error on sub 3")] });
    expect(onRetry).toHaveBeenCalledTimes(5);
    expect(onRetry).toHaveBeenNthCalledWith(5, 3, expect.any(ClientError));
    expect(onError).not.toHaveBeenCalled();

    // Let timeout fire for third resubscription
    await vi.runAllTimersAsync();
    expect(mockSubs.getAllSubscriptions(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION).length).toBe(4);
    const sub4 = mockSubs.expectSubscription(REMOTE_FILE_SYNC_EVENTS_SUBSCRIPTION);

    // Fourth error should fail - max attempts reached
    await sub4.emitResponse({ errors: [new GraphQLError("Final error")] });
    await vi.runAllTimersAsync();

    expect(onRetry).toHaveBeenCalledTimes(5); // No new retry
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("EditError", () => {
  const query = "query { foo }" as GraphQLQuery;

  it("renders a GraphQL error correctly", () => {
    const error = new ClientError(query, [new GraphQLError("Changed and deleted files must not overlap")]);
    expect(error.sprint()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      Gadget responded with the following error:

        • Changed and deleted files must not overlap

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });

  it("renders multiple GraphQL errors correctly", () => {
    const error = new ClientError(query, [
      new GraphQLError("Changed and deleted files must not overlap"),
      new GraphQLError("Files version mismatch, expected 1 but got 2"),
    ]);
    expect(error.sprint()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      Gadget responded with the following errors:

        • Changed and deleted files must not overlap
        • Files version mismatch, expected 1 but got 2

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });

  it("renders a CloseEvent correctly", () => {
    const error = new ClientError(query, {
      type: "close",
      code: 1000,
      reason: "Normal closure",
      wasClean: true,
    } as CloseEvent);
    expect(error.sprint()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      The connection to Gadget closed unexpectedly.

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });

  it("renders an ErrorEvent correctly", () => {
    const error = new ClientError(query, {
      type: "error",
      message: "connect ECONNREFUSED 10.254.254.254:3000",
      error: {
        errno: -61,
        code: "ECONNREFUSED",
        syscall: "connect",
        address: "10.254.254.254",
        port: 3000,
      },
    } as ErrorEvent);
    expect(error.sprint()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      connect ECONNREFUSED 10.254.254.254:3000

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });

  it("renders a string correctly", () => {
    const error = new ClientError(query, "We received a response without data");
    expect(error.sprint()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      We received a response without data

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });
});
