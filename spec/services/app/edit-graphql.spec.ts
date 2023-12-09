import { GraphQLError } from "graphql";
import { describe, expect, it } from "vitest";
import type { CloseEvent, ErrorEvent } from "ws";
import { EditGraphQLError, type GraphQLQuery } from "../../../src/services/app/edit-graphql.js";

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
