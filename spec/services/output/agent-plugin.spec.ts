import fs from "fs-extra";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maybePromptAgentsMd, maybePromptGadgetSkills } from "../../../src/services/output/agent-plugin.js";
import { output } from "../../../src/services/output/output.js";
import { mock, mockConfirm } from "../../__support__/mock.js";
import { expectStdout } from "../../__support__/output.js";
import { testDirPath } from "../../__support__/paths.js";

type FetchResponse = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

const makeProject = async (name: string): Promise<string> => {
  const dir = testDirPath(name);
  await fs.ensureDir(dir);
  return dir;
};

const mockTreeAndDownloads = (): void => {
  vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/git/trees/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tree: [
            { path: "skills/gadget/gadget-best-practices/SKILL.md", type: "blob", sha: "abc" },
            { path: "skills/gadget/gadget-best-practices/README.md", type: "blob", sha: "def" },
            { path: "skills/gadget/gadget-actions/SKILL.md", type: "blob", sha: "ghi" },
          ],
        }),
      } satisfies FetchResponse as any;
    }

    return {
      ok: true,
      status: 200,
      text: async () => `# content of ${url.split("/").pop()}`,
    } satisfies FetchResponse as any;
  });
};

describe("agent-plugin", () => {
  let interactiveSpy: { mockRestore: () => void };
  let stickySpy: { mockRestore: () => void };

  beforeEach(() => {
    interactiveSpy = mock(output, "isInteractive", "get", () => true);
    stickySpy = mock(output as any, "_writeStickyText", () => undefined);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    interactiveSpy.mockRestore();
    stickySpy.mockRestore();
    vi.unstubAllGlobals();
  });

  describe("maybePromptAgentsMd", () => {
    it("never asks again for a project after the user says no", async () => {
      const projectRoot = await makeProject("project");

      mockConfirm(false);
      await maybePromptAgentsMd({ projectRoot });

      const cacheFiles = await fs.readdir(testDirPath("cache"));
      expect(cacheFiles.some((f) => f.startsWith("opt_out-agents-md-hint-"))).toBe(true);

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptAgentsMd({ projectRoot });
    });

    it("downloads AGENTS.md when the user says yes", async () => {
      const projectRoot = await makeProject("project");

      mockConfirm(true);
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "# AGENTS\n",
      } satisfies FetchResponse as any);

      await maybePromptAgentsMd({ projectRoot });

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith("https://raw.githubusercontent.com/gadget-inc/skills/main/agents/AGENTS.md", {
        headers: { "User-Agent": "ggt", Accept: "text/plain" },
      });

      expect(await fs.readFile(path.join(projectRoot, "AGENTS.md"), "utf8")).toBe("# AGENTS\n");

      // should not prompt again after a successful install
      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptAgentsMd({ projectRoot });
    });

    it("does not throw if download fails", async () => {
      const projectRoot = await makeProject("project");

      mockConfirm(true);
      vi.mocked(fetch).mockRejectedValueOnce(new Error("fetch failed"));

      await maybePromptAgentsMd({ projectRoot });

      expectStdout().toContain("Installation failed.");
      expectStdout().toContain("ggt agent-plugin install");
    });
  });

  describe("maybePromptGadgetSkills", () => {
    it("never asks again for a project after the user says no", async () => {
      const projectRoot = await makeProject("project");

      mockConfirm(false);
      await maybePromptGadgetSkills({ projectRoot });

      const cacheFiles = await fs.readdir(testDirPath("cache"));
      expect(cacheFiles.some((f) => f.startsWith("opt_out-gadget-skills-hint-"))).toBe(true);

      mockConfirm(true, () => {
        throw new Error("confirm was called unexpectedly");
      });
      await maybePromptGadgetSkills({ projectRoot });
    });

    it("downloads and installs skills when user says yes", async () => {
      const projectRoot = await makeProject("project");

      mockConfirm(true);
      mockTreeAndDownloads();

      await maybePromptGadgetSkills({ projectRoot });

      expect(await fs.pathExists(path.join(projectRoot, ".agents/skills/gadget-best-practices/SKILL.md"))).toBe(true);
      expect(await fs.pathExists(path.join(projectRoot, ".agents/skills/gadget-best-practices/README.md"))).toBe(true);
      expect(await fs.pathExists(path.join(projectRoot, ".agents/skills/gadget-actions/SKILL.md"))).toBe(true);

      const link1 = await fs.readlink(path.join(projectRoot, ".claude/skills/gadget-best-practices"));
      expect(link1).toContain("gadget-best-practices");
      const link2 = await fs.readlink(path.join(projectRoot, ".claude/skills/gadget-actions"));
      expect(link2).toContain("gadget-actions");
    });

    it("does nothing if the sentinel skill is installed", async () => {
      const projectRoot = await makeProject("project");
      await fs.outputFile(path.join(projectRoot, ".agents/skills/gadget-best-practices/SKILL.md"), "---\nname: gadget\n---\n");

      await maybePromptGadgetSkills({ projectRoot });

      expectStdout().toBe("");
    });

    it("does not throw if tree fetch fails", async () => {
      const projectRoot = await makeProject("project");

      mockConfirm(true);
      vi.mocked(fetch).mockRejectedValueOnce(new Error("network error"));

      await maybePromptGadgetSkills({ projectRoot });

      expectStdout().toContain("Installation failed.");
    });

    it("does not throw if tree returns non-ok status", async () => {
      const projectRoot = await makeProject("project");

      mockConfirm(true);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
      } satisfies FetchResponse as any);

      await maybePromptGadgetSkills({ projectRoot });

      expectStdout().toContain("Installation failed.");
    });
  });
});
