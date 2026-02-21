import fs from "fs-extra";
import nock from "nock";
import path from "node:path";
import { simpleGit } from "simple-git";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as init from "../../src/commands/init.js";
import { ArgError } from "../../src/services/command/arg.js";
import { config } from "../../src/services/config/config.js";
import * as textInputModule from "../../src/services/output/text-input.js";
import { writeSession } from "../../src/services/user/session.js";
import { clearMemoized } from "../../src/services/util/function.js";
import { nockTestApps, testApp } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { writeDir } from "../__support__/files.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { mock, mockSelectOnce } from "../__support__/mock.js";
import { expectStdout } from "../__support__/output.js";
import { testDirPath } from "../__support__/paths.js";
import { loginTestUser, loginTestUserWithToken, matchAuthHeader } from "../__support__/user.js";

describe("init", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("exports args, usage, and run", () => {
    expect(init.args).toBeDefined();
    expect(init.usage).toBeTypeOf("function");
    expect(init.run).toBeTypeOf("function");
  });

  it("usage returns a non-empty string", () => {
    const result = init.usage(testCtx);

    expect(result).toBeTypeOf("string");
    expect(result).toContain("ggt init");
  });

  describe("create flow", () => {
    it("creates an app from a template with all args provided", async () => {
      // set up filesync mocks so the pull step succeeds (nothing to pull)
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const scope = matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps", { subdomain: "my-app", appType: "web-app-with-auth", typescript: true })
          .reply(201, { id: "123", slug: "my-app", primaryDomain: "my-app.gadget.app" }),
      );

      // use a fresh empty directory for --dir so resolveTargetDirectory passes
      const dir = testDirPath("init-target");

      await init.run(testCtx, makeArgs(init.args, "init", "my-app", "--template", "web-app-with-auth", `--dir=${dir}`));

      expect(scope.isDone()).toBe(true);
      expectStdout().toContain('Created app "my-app"');
    });

    it("creates an app with JavaScript when --no-typescript is passed", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const scope = matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps", { subdomain: "my-app", appType: "empty", typescript: false })
          .reply(201, { id: "456", slug: "my-app", primaryDomain: "my-app.gadget.app" }),
      );

      const dir = testDirPath("init-target");

      await init.run(testCtx, makeArgs(init.args, "init", "my-app", "--template", "empty", "--no-typescript", `--dir=${dir}`));

      expect(scope.isDone()).toBe(true);
      expectStdout().toContain('Created app "my-app"');
    });

    it("prompts for app name and template when not provided", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      mock(textInputModule, "textInput", () => Promise.resolve("prompted-app"));
      mockSelectOnce("empty");

      const scope = matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps", { subdomain: "prompted-app", appType: "empty", typescript: true })
          .reply(201, { id: "789", slug: "prompted-app", primaryDomain: "prompted-app.gadget.app" }),
      );

      const dir = testDirPath("init-target");

      await init.run(testCtx, makeArgs(init.args, "init", `--dir=${dir}`));

      expect(scope.isDone()).toBe(true);
      expectStdout().toContain('Created app "prompted-app"');
    });
  });

  describe("fork flow", () => {
    it("forks an existing app", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      mockSelectOnce("test");

      const scope = matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps", {
            subdomain: "my-fork",
            appType: "empty",
            typescript: true,
            forkFromAppId: String(testApp.id),
          })
          .reply(201, { id: "999", slug: "my-fork", primaryDomain: "my-fork.gadget.app" }),
      );

      const dir = testDirPath("init-target");

      await init.run(testCtx, makeArgs(init.args, "init", "my-fork", "--fork", `--dir=${dir}`));

      expect(scope.isDone()).toBe(true);
      expectStdout().toContain('Created app "my-fork"');
    });

    it("shows message when user has no apps to fork", async () => {
      // reset nock/auth state so we can nock apps endpoint to return empty
      nock.cleanAll();
      writeSession(testCtx, undefined);
      clearMemoized();
      loginTestUserWithToken({ optional: true });
      matchAuthHeader(nock(`https://${config.domains.services}`).get("/auth/api/apps").reply(200, []));

      await init.run(testCtx, makeArgs(init.args, "init", "my-fork", "--fork"));

      expectStdout().toContain("don't have any apps");
    });
  });

  describe("resolveTargetDirectory", () => {
    it("uses app slug when --dir is not provided", async () => {
      const result = await init.resolveTargetDirectory({ appSlug: "slug-based-app" });

      expect(result).toBe(path.resolve(process.cwd(), "slug-based-app"));
    });

    it("uses --dir value when provided", async () => {
      const customDir = testDirPath("custom-dir");
      const result = await init.resolveTargetDirectory({ dir: customDir, appSlug: "my-app" });

      expect(result).toBe(customDir);
    });

    it("throws ArgError if directory exists and has files", async () => {
      const dirPath = testDirPath("existing");
      await writeDir(dirPath, { "file.txt": "content" });

      await expect(init.resolveTargetDirectory({ dir: dirPath, appSlug: "my-app" })).rejects.toThrow(ArgError);
    });

    it("allows an existing empty directory", async () => {
      const dirPath = testDirPath("empty-dir");
      await fs.ensureDir(dirPath);

      const result = await init.resolveTargetDirectory({ dir: dirPath, appSlug: "my-app" });

      // when dir is an absolute path, path.resolve returns it unchanged
      expect(result).toBe(dirPath);
    });
  });

  describe("writeInitialSyncJson", () => {
    it("creates .gadget/sync.json with correct state", async () => {
      const targetDir = testDirPath("new-app");

      await init.writeInitialSyncJson({ targetDir, appSlug: "my-app" });

      const state = await fs.readJSON(path.join(targetDir, ".gadget/sync.json"));
      expect(state).toEqual({
        application: "my-app",
        environment: "development",
        environments: {
          development: { filesVersion: "0" },
        },
      });
    });

    it("creates the .gadget/ directory if it does not exist", async () => {
      const targetDir = testDirPath("brand-new");

      await init.writeInitialSyncJson({ targetDir, appSlug: "my-app" });

      expect(await fs.pathExists(path.join(targetDir, ".gadget"))).toBe(true);
    });
  });

  describe("pullInitialFiles", () => {
    it("pulls files from a newly created app", async () => {
      const { localDir, expectDirs } = await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "", "package.json": "{}" },
      });

      await init.pullInitialFiles(testCtx, { targetDir: localDir.path, appSlug: "test" });

      await expectDirs().resolves.toMatchObject({
        localDir: expect.objectContaining({ "package.json": "{}" }),
      });
    });

    it("handles empty app with no files to pull", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const targetDir = testDirPath("local");

      await expect(init.pullInitialFiles(testCtx, { targetDir, appSlug: "test" })).resolves.toBeUndefined();
    });
  });

  describe(".ignore file", () => {
    it("generates .ignore file with default patterns", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const dir = testDirPath("init-target");

      matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps")
          .reply(201, { id: "123", slug: "my-app", primaryDomain: "my-app.gadget.app" }),
      );

      await init.run(testCtx, makeArgs(init.args, "init", "my-app", "--template", "empty", `--dir=${dir}`));

      const ignoreContents = await fs.readFile(path.join(dir, ".ignore"), "utf-8");
      expect(ignoreContents).toContain("dist/");
      expect(ignoreContents).toContain("build/");
      expect(ignoreContents).toContain(".cache/");
      expect(ignoreContents).toContain(".env");
      expect(ignoreContents).toContain(".env.local");
    });

    it("generates .ignore file even with --no-git", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const dir = testDirPath("init-target");

      matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps")
          .reply(201, { id: "123", slug: "my-app", primaryDomain: "my-app.gadget.app" }),
      );

      await init.run(testCtx, makeArgs(init.args, "init", "my-app", "--template", "empty", "--no-git", `--dir=${dir}`));

      const ignoreContents = await fs.readFile(path.join(dir, ".ignore"), "utf-8");
      expect(ignoreContents).toContain("dist/");
      expect(ignoreContents).toContain(".env");
    });
  });

  describe(".gitignore file", () => {
    it("generates .gitignore file with default patterns", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const dir = testDirPath("init-target");

      matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps")
          .reply(201, { id: "123", slug: "my-app", primaryDomain: "my-app.gadget.app" }),
      );

      await init.run(testCtx, makeArgs(init.args, "init", "my-app", "--template", "empty", `--dir=${dir}`));

      const gitignoreContents = await fs.readFile(path.join(dir, ".gitignore"), "utf-8");
      expect(gitignoreContents).toContain("node_modules/");
      expect(gitignoreContents).toContain(".env");
      expect(gitignoreContents).toContain("dist/");
      expect(gitignoreContents).toContain(".dl/");
    });

    it("does not generate .gitignore when --no-git is passed", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const dir = testDirPath("init-target");

      matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps")
          .reply(201, { id: "123", slug: "my-app", primaryDomain: "my-app.gadget.app" }),
      );

      await init.run(testCtx, makeArgs(init.args, "init", "my-app", "--template", "empty", "--no-git", `--dir=${dir}`));

      expect(await fs.pathExists(path.join(dir, ".gitignore"))).toBe(false);
    });
  });

  describe("git initialization", () => {
    it("initializes git and creates initial commit", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const dir = testDirPath("init-target");

      matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps")
          .reply(201, { id: "123", slug: "my-app", primaryDomain: "my-app.gadget.app" }),
      );

      await init.run(testCtx, makeArgs(init.args, "init", "my-app", "--template", "empty", `--dir=${dir}`));

      expect(simpleGit).toHaveBeenCalledWith(dir);
      const mockGit = vi.mocked(simpleGit).mock.results[0]!.value as ReturnType<typeof simpleGit>;
      expect(mockGit.init).toHaveBeenCalledOnce();
      expect(mockGit.add).toHaveBeenCalledWith(".");
      expect(mockGit.commit).toHaveBeenCalledWith("Initial commit from Gadget");
    });

    it("skips git init when --no-git is passed", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const dir = testDirPath("init-target");

      matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps")
          .reply(201, { id: "123", slug: "my-app", primaryDomain: "my-app.gadget.app" }),
      );

      await init.run(testCtx, makeArgs(init.args, "init", "my-app", "--template", "empty", "--no-git", `--dir=${dir}`));

      // simpleGit may be called by other parts of the system (e.g. sync-json),
      // but it should not have been called with the target dir for git init
      const calls = vi.mocked(simpleGit).mock.calls;
      const calledWithTargetDir = calls.some(([arg]) => arg === dir);
      expect(calledWithTargetDir).toBe(false);
    });
  });

  describe("success message", () => {
    it("prints success message with cd instruction", async () => {
      await makeSyncScenario({
        command: "init",
        localFiles: { ".gadget/": "" },
        gadgetFiles: { ".gadget/": "" },
      });

      const dir = testDirPath("init-target");

      matchAuthHeader(
        nock(`https://${config.domains.services}`)
          .post("/auth/api/apps")
          .reply(201, { id: "123", slug: "my-app", primaryDomain: "my-app.gadget.app" }),
      );

      await init.run(testCtx, makeArgs(init.args, "init", "my-app", "--template", "empty", `--dir=${dir}`));

      expectStdout().toContain("Your app is ready!");
      expectStdout().toContain(`cd ${dir} && ggt dev`);
    });
  });
});
