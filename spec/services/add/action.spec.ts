import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditClientError } from "../../../src/commands/add.ts";
import { addAction, resolveActionPath } from "../../../src/services/add/action.ts";
import type { GlobalActionApiIdentifier, ModelApiIdentifier } from "../../../src/services/app/app.ts";
import { CREATE_ACTION_MUTATION } from "../../../src/services/app/edit/operation.ts";
import { nockTestApps } from "../../__support__/app.ts";
import { testCtx } from "../../__support__/context.ts";
import { expectError } from "../../__support__/error.ts";
import { makeSyncScenario } from "../../__support__/filesync.ts";
import { nockEditResponse } from "../../__support__/graphql.ts";
import { loginTestUser } from "../../__support__/user.ts";

vi.mock("../../../src/services/output/select.js", () => ({
  select: vi.fn().mockResolvedValue("models"),
}));

vi.mock("../../../src/services/output/print.js", () => ({
  println: vi.fn(),
}));

const model = (apiIdentifier: string, namespace?: string[]): ModelApiIdentifier => ({
  apiIdentifier,
  namespace: namespace ?? null,
});

const globalAction = (apiIdentifier: string, namespace?: string[]): GlobalActionApiIdentifier => ({
  apiIdentifier,
  namespace: namespace ?? null,
});

describe("resolveActionPath", () => {
  it("passes through a simple path with no conflicts", async () => {
    const result = await resolveActionPath("doSomething", [], []);
    expect(result).toEqual({ path: "doSomething" });
  });

  it("passes through a model action path with no conflicts", async () => {
    const models = [model("post")];
    const result = await resolveActionPath("post/publish", models, []);
    expect(result).toEqual({ path: "post/publish" });
  });

  it("passes through when only a model matches but no global action namespace conflicts", async () => {
    const models = [model("post")];
    const actions = [globalAction("audit", ["other"])];
    const result = await resolveActionPath("post/publish", models, actions);
    expect(result).toEqual({ path: "post/publish" });
  });

  it("passes through when only a global action namespace matches but no model conflicts", async () => {
    const models = [model("other")];
    const actions = [globalAction("audit", ["post"])];
    const result = await resolveActionPath("post/publish", models, actions);
    expect(result).toEqual({ path: "post/publish" });
  });

  it("prompts and prefixes path when both a model and global action namespace conflict", async () => {
    // model with no namespace (empty array, not null) so namespace?.join("/") === ""
    const models = [model("post", [])];
    // global action with namespace ["post"] so namespace?.join("/") === "post"
    const actions = [globalAction("audit", ["post"])];
    const result = await resolveActionPath("post/publish", models, actions);
    expect(result).toEqual({ path: "models/post/publish", overrideContextAction: "models" });
  });

  it("handles nested namespaces without conflict", async () => {
    const models = [model("post", ["blog"])];
    const actions: GlobalActionApiIdentifier[] = [];
    const result = await resolveActionPath("blog/post/publish", models, actions);
    expect(result).toEqual({ path: "blog/post/publish" });
  });
});

describe("addAction", () => {
  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    await makeSyncScenario();
  });

  it("creates an action", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_ACTION_MUTATION,
      response: { data: { createAction: { remoteFilesVersion: "10", changed: [] } } },
      expectVariables: { path: "doSomething" },
    });

    const result = await addAction(testCtx, { syncJson, filesync, path: "doSomething" });

    expect(result.path).toBe("doSomething");
    expect(result.remoteFilesVersion).toBe("10");
    expect(result.changed).toEqual([]);
  });

  it("creates a model action with a path prefix", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_ACTION_MUTATION,
      response: { data: { createAction: { remoteFilesVersion: "10", changed: [] } } },
      expectVariables: { path: "model/post/publish" },
    });

    const result = await addAction(testCtx, { syncJson, filesync, path: "model/post/publish" });

    expect(result.path).toBe("model/post/publish");
  });

  it("throws EditClientError on API error", async () => {
    const { syncJson, filesync } = await makeSyncScenario();

    nockEditResponse({
      operation: CREATE_ACTION_MUTATION,
      response: { errors: [new GraphQLError("Action already exists")] },
      statusCode: 200,
    });

    const error = await expectError(() => addAction(testCtx, { syncJson, filesync, path: "doSomething" }));
    expect(error).toBeInstanceOf(EditClientError);
  });
});
