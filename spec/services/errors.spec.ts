import { GraphQLError } from "graphql";
import type { CloseEvent, ErrorEvent } from "ws";
import Sync from "../../src/commands/sync.js";
import { context } from "../../src/services/context.js";
import {
  ClientError,
  FlagError,
  InvalidSyncAppFlagError,
  InvalidSyncFileError,
  UnexpectedError,
  YarnNotFoundError,
} from "../../src/services/errors.js";
import { describe, it, expect } from "vitest";

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

describe("FlagError", () => {
  it("renders correctly", () => {
    const error = new FlagError({ name: "bad", char: "b" }, "You were about to do something dangerous, so we stopped you.");
    expect(error.render()).toMatchSnapshot();
  });
});

describe("InvalidSyncFileError", () => {
  it("renders correctly", () => {
    const app = "test";
    const dir = "~/gadget/test";
    const sync = new Sync(["--app", app, dir], context.config);
    sync.dir = dir;

    const error = new InvalidSyncFileError(new Error(), sync, app);
    expect(error.render()).toMatchSnapshot();
  });
});

describe("InvalidSyncAppFlagError", () => {
  it("renders correctly", () => {
    const app = "not-test";
    const dir = "~/gadget/test";
    const sync = new Sync(["--app", app, dir], context.config);
    sync.dir = dir;
    sync.state = { app: "test" } as any;
    sync.flags = { app } as any;

    const error = new InvalidSyncAppFlagError(sync);
    expect(error.render()).toMatchSnapshot();
  });
});
