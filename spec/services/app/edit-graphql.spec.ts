import { GraphQLError } from "graphql";
import nock from "nock";
import { beforeEach, describe, expect, it } from "vitest";
import type { CloseEvent, ErrorEvent } from "ws";
import { EditGraphQL, EditGraphQLError, REMOTE_FILES_VERSION_QUERY, type GraphQLQuery } from "../../../src/services/app/edit-graphql.js";
import type { Context } from "../../../src/services/command/context.js";
import { config } from "../../../src/services/config/config.js";
import { loadCookie } from "../../../src/services/http/auth.js";
import { testApp } from "../../__support__/app.js";
import { makeContext } from "../../__support__/context.js";
import { nockEditGraphQLResponse } from "../../__support__/edit-graphql.js";
import { expectError } from "../../__support__/error.js";
import { loginTestUser } from "../../__support__/user.js";

describe("EditGraphQL", () => {
  let ctx: Context;

  beforeEach(() => {
    loginTestUser();
    ctx = makeContext();
  });

  it("throws EditGraphQLError when it receives errors", async () => {
    nockEditGraphQLResponse({
      query: REMOTE_FILES_VERSION_QUERY,
      result: {
        errors: [new GraphQLError("Something went wrong")],
      },
    });

    const editGraphQL = new EditGraphQL(ctx, testApp);

    const error: EditGraphQLError = await expectError(() => editGraphQL.query({ query: REMOTE_FILES_VERSION_QUERY }));
    expect(error).toBeInstanceOf(EditGraphQLError);
    expect(error.cause).toEqual([{ message: "Something went wrong" }]);
  });

  it("throws EditGraphQLError when it receives a 500", async () => {
    nockEditGraphQLResponse({
      query: REMOTE_FILES_VERSION_QUERY,
      result: {
        errors: [new GraphQLError("Something went wrong")],
      },
      statusCode: 500,
    });

    const editGraphQL = new EditGraphQL(ctx, testApp);

    const error: EditGraphQLError = await expectError(() => editGraphQL.query({ query: REMOTE_FILES_VERSION_QUERY }));
    expect(error).toBeInstanceOf(EditGraphQLError);
    expect(error.cause).toEqual([{ message: "Something went wrong" }]);
  });

  it("throws EditGraphQLError when it receives invalid json", async () => {
    nock(`https://${testApp.slug}--development.${config.domains.app}`)
      .post("/edit/api/graphql")
      .matchHeader("cookie", (cookie) => loadCookie() === cookie)
      .reply(503, "Service Unavailable", { "content-type": "text/plain" });

    const editGraphQL = new EditGraphQL(ctx, testApp);

    const error: EditGraphQLError = await expectError(() => editGraphQL.query({ query: REMOTE_FILES_VERSION_QUERY }));
    expect(error).toBeInstanceOf(EditGraphQLError);
    expect(error.cause).toEqual("Service Unavailable");
  });
});

describe("EditGraphQLError", () => {
  const query = "query { foo }" as GraphQLQuery;

  it("renders a GraphQL error correctly", () => {
    const error = new EditGraphQLError(query, [new GraphQLError("Changed and deleted files must not overlap")]);
    expect(error.toString()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      Gadget responded with the following error:

        • Changed and deleted files must not overlap

      If you think this is a bug, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000"
    `);
  });

  it("renders multiple GraphQL errors correctly", () => {
    const error = new EditGraphQLError(query, [
      new GraphQLError("Changed and deleted files must not overlap"),
      new GraphQLError("Files version mismatch, expected 1 but got 2"),
    ]);
    expect(error.toString()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      Gadget responded with the following errors:

        • Changed and deleted files must not overlap
        • Files version mismatch, expected 1 but got 2

      If you think this is a bug, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000"
    `);
  });

  it("renders a CloseEvent correctly", () => {
    const error = new EditGraphQLError(query, {
      type: "close",
      code: 1000,
      reason: "Normal closure",
      wasClean: true,
    } as CloseEvent);
    expect(error.toString()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      The connection to Gadget closed unexpectedly.

      If you think this is a bug, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000"
    `);
  });

  it("renders an ErrorEvent correctly", () => {
    const error = new EditGraphQLError(query, {
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
    expect(error.toString()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      connect ECONNREFUSED 10.254.254.254:3000

      If you think this is a bug, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000"
    `);
  });

  it("renders a string correctly", () => {
    const error = new EditGraphQLError(query, "We received a response without data");
    expect(error.toString()).toMatchInlineSnapshot(`
      "An error occurred while communicating with Gadget

      We received a response without data

      If you think this is a bug, please submit an issue using the link below.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000"
    `);
  });
});
