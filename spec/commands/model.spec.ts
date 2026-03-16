import fs from "fs-extra";
import { beforeEach, describe, expect, it } from "vitest";

import model from "../../src/commands/model.ts";
import { CREATE_MODEL_MUTATION } from "../../src/services/app/edit/operation.ts";
import { FlagError } from "../../src/services/command/flag.ts";
import { runCommand } from "../../src/services/command/run.ts";
import { confirm } from "../../src/services/output/confirm.ts";
import { nockTestApps } from "../__support__/app.ts";
import { testCtx } from "../__support__/context.ts";
import { expectError } from "../__support__/error.ts";
import { makeSyncScenario } from "../__support__/filesync.ts";
import { nockEditResponse } from "../__support__/graphql.ts";
import { mockConfirmOnce } from "../__support__/mock.ts";
import { testDirPath } from "../__support__/paths.ts";
import { loginTestUser } from "../__support__/user.ts";

const baseModelFiles = {
  "api/": "",
  "api/models/": "",
  "api/models/post/": "",
  "api/models/post/schema.gadget.ts": "export default {};\n",
};

describe("model", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  describe("add", () => {
    it("adds a model", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: CREATE_MODEL_MUTATION,
        response: { data: { createModel: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: { path: "post", fields: [] },
      });

      await runCommand(testCtx, model, "add", "post");
    });

    it("adds a model with fields", async () => {
      await makeSyncScenario();

      nockEditResponse({
        operation: CREATE_MODEL_MUTATION,
        response: { data: { createModel: { remoteFilesVersion: "10", changed: [] } } },
        expectVariables: {
          path: "post",
          fields: [
            { name: "title", fieldType: "string" },
            { name: "published", fieldType: "boolean" },
          ],
        },
      });

      await runCommand(testCtx, model, "add", "post", "title:string", "published:boolean");
    });

    it("requires a model name", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, model, "add"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toContain("Missing required argument: name");
    });

    it.each(["field;string", "field:", ":", ""])("returns FlagError for invalid field definition %s", async (fieldDef) => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, model, "add", "post", fieldDef));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toContain("is not a valid field definition");
    });
  });

  describe("remove", () => {
    it("removes a model with confirmation", async () => {
      await makeSyncScenario({
        filesVersion1Files: baseModelFiles,
        localFiles: baseModelFiles,
        gadgetFiles: baseModelFiles,
      });
      mockConfirmOnce();

      await runCommand(testCtx, model, "remove", "post");

      expect(confirm).toHaveBeenCalledOnce();
      expect(await fs.pathExists(testDirPath("local/api/models/post/schema.gadget.ts"))).toBe(false);
      expect(await fs.pathExists(testDirPath("gadget/api/models/post/schema.gadget.ts"))).toBe(false);
    });

    it("removes a model with --force", async () => {
      await makeSyncScenario({
        filesVersion1Files: baseModelFiles,
        localFiles: baseModelFiles,
        gadgetFiles: baseModelFiles,
      });

      await runCommand(testCtx, model, "remove", "post", "--force");

      expect(confirm).not.toHaveBeenCalled();
      expect(await fs.pathExists(testDirPath("local/api/models/post/schema.gadget.ts"))).toBe(false);
      expect(await fs.pathExists(testDirPath("gadget/api/models/post/schema.gadget.ts"))).toBe(false);
    });

    it("errors when model does not exist", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, model, "remove", "post", "--force"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toContain("post does not exist");
    });
  });

  describe("rename", () => {
    it("renames a model", async () => {
      await makeSyncScenario({
        filesVersion1Files: baseModelFiles,
        localFiles: baseModelFiles,
        gadgetFiles: baseModelFiles,
      });

      await runCommand(testCtx, model, "rename", "post", "article");

      expect(await fs.pathExists(testDirPath("local/api/models/post/schema.gadget.ts"))).toBe(false);
      expect(await fs.pathExists(testDirPath("local/api/models/article/schema.gadget.ts"))).toBe(true);
      expect(await fs.pathExists(testDirPath("gadget/api/models/post/schema.gadget.ts"))).toBe(false);
      expect(await fs.pathExists(testDirPath("gadget/api/models/article/schema.gadget.ts"))).toBe(true);
    });

    it("errors when target model already exists", async () => {
      const files = {
        ...baseModelFiles,
        "api/models/article/": "",
        "api/models/article/schema.gadget.ts": "export default {};\n",
      };
      await makeSyncScenario({ filesVersion1Files: files, localFiles: files, gadgetFiles: files });

      const error = await expectError(() => runCommand(testCtx, model, "rename", "post", "article"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toContain("article already exists");
    });

    it("requires source and target model names", async () => {
      await makeSyncScenario();

      const error = await expectError(() => runCommand(testCtx, model, "rename", "post"));
      expect(error).toBeInstanceOf(FlagError);
      expect(error.message).toContain("Missing required argument: new-name");
    });
  });
});
