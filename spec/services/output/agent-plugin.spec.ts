import fs from "fs-extra";
import nock from "nock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Directory } from "../../../src/services/filesync/directory.js";
import {
  installAgentsMdScaffold,
  installGadgetSkillsIntoProject,
  maybePromptAgentsMd,
  maybePromptGadgetSkills,
} from "../../../src/services/output/agent-plugin.js";
import { output } from "../../../src/services/output/output.js";
import { testCtx } from "../../__support__/context.js";
import { mock, mockConfirm } from "../../__support__/mock.js";
import { expectStdout } from "../../__support__/output.js";
import { testDirPath } from "../../__support__/paths.js";

const makeProject = async (name: string, { empty = false }: { empty?: boolean } = {}): Promise<Directory> => {
  const dir = testDirPath(name);
  await fs.ensureDir(dir);
  if (!empty) {
    // create a placeholder user file so hasNonGadgetFiles() is true
    await fs.outputFile(`${dir}/index.js`, "");
  }
  return Directory.init(dir);
};

const mockTreeAndDownloads = (): void => {
  nock("https://api.github.com")
    .get(/\/repos\/gadget-inc\/skills\/git\/trees\//)
    .reply(200, {
      tree: [
        { path: "skills/gadget/gadget-best-practices/SKILL.md", type: "blob", sha: "abc" },
        { path: "skills/gadget/gadget-best-practices/README.md", type: "blob", sha: "def" },
        { path: "skills/gadget/gadget-actions/SKILL.md", type: "blob", sha: "ghi" },
      ],
    });

  nock("https://raw.githubusercontent.com")
    .get(/\/gadget-inc\/skills\//)
    .times(3)
    .reply(200, function () {
      const urlPath = this.req.path;
      return `# content of ${urlPath.split("/").pop()}`;
    });
};

describe("agent-plugin", () => {
  let interactiveSpy: { mockRestore: () => void };
  let stickySpy: { mockRestore: () => void };

  beforeEach(() => {
    interactiveSpy = mock(output, "isInteractive", "get", () => true);
    stickySpy = mock(output as any, "_writeStickyText", () => undefined);
  });

  afterEach(() => {
    interactiveSpy.mockRestore();
    stickySpy.mockRestore();
    nock.cleanAll();
  });

  describe("installAgentsMdScaffold", () => {
    const mockAgentsDownload = (): void => {
      nock("https://raw.githubusercontent.com").get("/gadget-inc/skills/main/agents/AGENTS.md").reply(200, "# AGENTS\n");
    };

    it("skips if AGENTS.md exists and force is false", async () => {
      const directory = await makeProject("agents-exists");
      await fs.outputFile(directory.absolute("AGENTS.md"), "keep me\n");

      await installAgentsMdScaffold({ ctx: testCtx, directory });

      expect(await fs.readFile(directory.absolute("AGENTS.md"), "utf8")).toBe("keep me\n");
      expectStdout().toContain("Agent scaffold already exists");
    });

    it("skips if CLAUDE.md exists as a regular file and force is false", async () => {
      const directory = await makeProject("claude-file");
      await fs.outputFile(directory.absolute("CLAUDE.md"), "keep me\n");

      await installAgentsMdScaffold({ ctx: testCtx, directory });

      expect(await fs.readFile(directory.absolute("CLAUDE.md"), "utf8")).toBe("keep me\n");
      expect(await fs.pathExists(directory.absolute("AGENTS.md"))).toBe(false);
      expectStdout().toContain("Agent scaffold already exists");
    });

    it("skips if CLAUDE.md is a dangling symlink and force is false", async () => {
      const directory = await makeProject("claude-dangling");
      await fs.symlink("AGENTS.md", directory.absolute("CLAUDE.md"));

      await installAgentsMdScaffold({ ctx: testCtx, directory });

      expectStdout().toContain("Agent scaffold already exists");
    });

    it("overwrites AGENTS.md and CLAUDE.md when force is true", async () => {
      const directory = await makeProject("force-overwrite");
      await fs.outputFile(directory.absolute("AGENTS.md"), "old agents\n");
      await fs.outputFile(directory.absolute("CLAUDE.md"), "old claude\n");

      mockAgentsDownload();

      await installAgentsMdScaffold({ ctx: testCtx, directory, force: true });

      expect(await fs.readFile(directory.absolute("AGENTS.md"), "utf8")).toBe("# AGENTS\n");
      const linkTarget = await fs.readlink(directory.absolute("CLAUDE.md"));
      expect(linkTarget).toBe("AGENTS.md");
      expectStdout().toContain("AGENTS.md installed");
    });

    it("overwrites dangling CLAUDE.md symlink when force is true", async () => {
      const directory = await makeProject("force-dangling");
      await fs.symlink("nonexistent", directory.absolute("CLAUDE.md"));

      mockAgentsDownload();

      await installAgentsMdScaffold({ ctx: testCtx, directory, force: true });

      expect(await fs.readFile(directory.absolute("AGENTS.md"), "utf8")).toBe("# AGENTS\n");
      const linkTarget = await fs.readlink(directory.absolute("CLAUDE.md"));
      expect(linkTarget).toBe("AGENTS.md");
    });

    it("installs fresh when neither file exists", async () => {
      const directory = await makeProject("fresh");

      mockAgentsDownload();

      await installAgentsMdScaffold({ ctx: testCtx, directory });

      expect(await fs.readFile(directory.absolute("AGENTS.md"), "utf8")).toBe("# AGENTS\n");
      const linkTarget = await fs.readlink(directory.absolute("CLAUDE.md"));
      expect(linkTarget).toBe("AGENTS.md");
      expectStdout().toContain("AGENTS.md installed");
    });
  });

  describe("installGadgetSkillsIntoProject", () => {
    it("skips if sentinel skill exists and force is false", async () => {
      const directory = await makeProject("skills-exist");
      await fs.outputFile(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"), "existing\n");

      await installGadgetSkillsIntoProject({ ctx: testCtx, directory });

      expect(await fs.readFile(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"), "utf8")).toBe("existing\n");
      expectStdout().toContain("Gadget skills already installed");
    });

    it("overwrites skills when force is true", async () => {
      const directory = await makeProject("skills-force");
      await fs.outputFile(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"), "old\n");

      mockTreeAndDownloads();

      await installGadgetSkillsIntoProject({ ctx: testCtx, directory, force: true });

      const content = await fs.readFile(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"), "utf8");
      expect(content).not.toBe("old\n");
      expectStdout().toContain("Installed skills:");
    });

    it("installs fresh when no skills exist", async () => {
      const directory = await makeProject("skills-fresh");

      mockTreeAndDownloads();

      await installGadgetSkillsIntoProject({ ctx: testCtx, directory });

      expect(await fs.pathExists(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"))).toBe(true);
      expect(await fs.pathExists(directory.absolute(".agents/skills/gadget-actions/SKILL.md"))).toBe(true);
      expectStdout().toContain("Installed skills:");
    });
  });

  describe("maybePromptAgentsMd", () => {
    it("skips prompt if directory does not exist", async () => {
      const directory = await makeProject("prompt-agents-nonexistent");
      await fs.remove(directory.path);

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptAgentsMd({ ctx: testCtx, directory });

      expectStdout().toBe("");
    });

    it("skips prompt if directory is empty", async () => {
      const directory = await makeProject("prompt-agents-empty", { empty: true });

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptAgentsMd({ ctx: testCtx, directory });

      expectStdout().toBe("");
    });

    it("skips prompt if directory has only .gadget files", async () => {
      const directory = await makeProject("prompt-agents-dot-gadget-only", { empty: true });
      await fs.outputFile(directory.absolute(".gadget/sync.json"), "{}");

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptAgentsMd({ ctx: testCtx, directory });

      expectStdout().toBe("");
    });

    it("never asks again for a project after the user says no", async () => {
      const directory = await makeProject("prompt-agents-no");

      mockConfirm(false);
      await maybePromptAgentsMd({ ctx: testCtx, directory });

      const cacheFiles = await fs.readdir(testDirPath("cache"));
      expect(cacheFiles.some((f) => f.startsWith("opt_out-agents-md-hint-"))).toBe(true);

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptAgentsMd({ ctx: testCtx, directory });
    });

    it("downloads AGENTS.md when the user says yes", async () => {
      const directory = await makeProject("prompt-agents-yes");

      mockConfirm(true);
      nock("https://raw.githubusercontent.com").get("/gadget-inc/skills/main/agents/AGENTS.md").reply(200, "# AGENTS\n");

      await maybePromptAgentsMd({ ctx: testCtx, directory });

      expect(await fs.readFile(directory.absolute("AGENTS.md"), "utf8")).toBe("# AGENTS\n");

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptAgentsMd({ ctx: testCtx, directory });
    });

    it("does not throw if download fails", async () => {
      const directory = await makeProject("prompt-agents-fail");

      mockConfirm(true);
      nock("https://raw.githubusercontent.com").get("/gadget-inc/skills/main/agents/AGENTS.md").replyWithError("network error");

      await maybePromptAgentsMd({ ctx: testCtx, directory });

      expectStdout().toContain("Failed to install AGENTS.md.");
    });
  });

  describe("maybePromptGadgetSkills", () => {
    it("skips prompt if directory does not exist", async () => {
      const directory = await makeProject("prompt-skills-nonexistent");
      await fs.remove(directory.path);

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptGadgetSkills({ ctx: testCtx, directory });

      expectStdout().toBe("");
    });

    it("skips prompt if directory is empty", async () => {
      const directory = await makeProject("prompt-skills-empty", { empty: true });

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptGadgetSkills({ ctx: testCtx, directory });

      expectStdout().toBe("");
    });

    it("skips prompt if directory has only .gadget files", async () => {
      const directory = await makeProject("prompt-skills-dot-gadget-only", { empty: true });
      await fs.outputFile(directory.absolute(".gadget/sync.json"), "{}");

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptGadgetSkills({ ctx: testCtx, directory });

      expectStdout().toBe("");
    });

    it("never asks again for a project after the user says no", async () => {
      const directory = await makeProject("prompt-skills-no");

      mockConfirm(false);
      await maybePromptGadgetSkills({ ctx: testCtx, directory });

      const cacheFiles = await fs.readdir(testDirPath("cache"));
      expect(cacheFiles.some((f) => f.startsWith("opt_out-gadget-skills-hint-"))).toBe(true);

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptGadgetSkills({ ctx: testCtx, directory });
    });

    it("downloads and installs skills when user says yes", async () => {
      const directory = await makeProject("prompt-skills-yes");

      mockConfirm(true);
      mockTreeAndDownloads();

      await maybePromptGadgetSkills({ ctx: testCtx, directory });

      expect(await fs.pathExists(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"))).toBe(true);
      expect(await fs.pathExists(directory.absolute(".agents/skills/gadget-best-practices/README.md"))).toBe(true);
      expect(await fs.pathExists(directory.absolute(".agents/skills/gadget-actions/SKILL.md"))).toBe(true);

      const link1 = await fs.readlink(directory.absolute(".claude/skills/gadget-best-practices"));
      expect(link1).toContain("gadget-best-practices");
      const link2 = await fs.readlink(directory.absolute(".claude/skills/gadget-actions"));
      expect(link2).toContain("gadget-actions");
    });

    it("does nothing if the sentinel skill is installed", async () => {
      const directory = await makeProject("prompt-skills-sentinel");
      await fs.outputFile(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"), "---\nname: gadget\n---\n");

      await maybePromptGadgetSkills({ ctx: testCtx, directory });

      expectStdout().toBe("");
    });

    it("does not throw if tree fetch fails", async () => {
      const directory = await makeProject("prompt-skills-tree-fail");

      mockConfirm(true);
      nock("https://api.github.com")
        .get(/\/repos\/gadget-inc\/skills\/git\/trees\//)
        .replyWithError("network error");

      await maybePromptGadgetSkills({ ctx: testCtx, directory });

      expectStdout().toContain("Failed to install skills.");
    });

    it("does not throw if tree returns non-ok status", async () => {
      const directory = await makeProject("prompt-skills-tree-403");

      mockConfirm(true);
      nock("https://api.github.com")
        .get(/\/repos\/gadget-inc\/skills\/git\/trees\//)
        .reply(403, {});

      await maybePromptGadgetSkills({ ctx: testCtx, directory });

      expectStdout().toContain("Failed to install skills.");
    });
  });
});
