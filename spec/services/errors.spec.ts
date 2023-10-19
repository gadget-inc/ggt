import { GraphQLError } from "graphql";
import { describe, expect, it } from "vitest";
import type { CloseEvent, ErrorEvent } from "ws";
import { ClientError, InvalidSyncFileError, UnexpectedError, YarnNotFoundError } from "../../src/services/errors.js";

describe("UnexpectedError", () => {
  it("renders correctly", () => {
    const cause = new Error("Whoops!");
    cause.stack = "Error: Whoops!\n    at <anonymous>:1:1";
    const error = new UnexpectedError(cause);
    expect(error.render()).toMatchSnapshot();
  });
});

describe("ClientError", () => {
  it("renders a GraphQL error correctly", () => {
    const error = new ClientError({ query: "query { foo }" }, [new GraphQLError("Changed and deleted files must not overlap")]);
    expect(error.render()).toMatchSnapshot();
  });

  it("renders multiple GraphQL errors correctly", () => {
    const error = new ClientError({ query: "query { foo }" }, [
      new GraphQLError("Changed and deleted files must not overlap"),
      new GraphQLError("Files version mismatch, expected 1 but got 2"),
    ]);
    expect(error.render()).toMatchSnapshot();
  });

  it("renders a CloseEvent correctly", () => {
    const error = new ClientError({ query: "query { foo }" }, {
      type: "close",
      code: 1000,
      reason: "Normal closure",
      wasClean: true,
    } as CloseEvent);
    expect(error.render()).toMatchSnapshot();
  });

  it("renders an ErrorEvent correctly", () => {
    const error = new ClientError({ query: "query { foo }" }, {
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
    expect(error.render()).toMatchSnapshot();
  });

  it("renders a string correctly", () => {
    const error = new ClientError({ query: "query { foo }" }, "We received a response without data");
    expect(error.render()).toMatchSnapshot();
  });
});

describe("YarnNotFoundError", () => {
  it("renders correctly", () => {
    const error = new YarnNotFoundError();
    expect(error.render()).toMatchSnapshot();
  });
});

describe("InvalidSyncFileError", () => {
  it("renders correctly", () => {
    const dir = "~/gadget/test";
    const app = "test";

    const error = new InvalidSyncFileError(dir, app);
    expect(error.render()).toMatchSnapshot();
  });
});
