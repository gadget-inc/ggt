import fs from "fs-extra";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";

import * as agentPlugin from "../../src/commands/agent-plugin.js";
import { Directory } from "../../src/services/filesync/directory.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { expectStdout } from "../__support__/output.js";
import { testDirPath } from "../__support__/paths.js";

const makeProject = async (name: string): Promise<Directory> => {
  const dir = testDirPath(name);
  await fs.ensureDir(dir);
  return Directory.init(dir);
};

const mockAgentsDownload = (): void => {
  nock("https://raw.githubusercontent.com").get("/gadget-inc/skills/main/agents/AGENTS.md").reply(200, "# AGENTS\n");
};

const mockTreeAndDownloads = (): void => {
  nock("https://api.github.com")
    .get(/\/repos\/gadget-inc\/skills\/git\/trees\//)
    .reply(200, {
      tree: [
        { path: "skills/gadget/gadget-best-practices/SKILL.md", type: "blob", sha: "abc" },
        { path: "skills/gadget/gadget-best-practices/README.md", type: "blob", sha: "def" },
      ],
    });

  nock("https://api.github.com").get("/repos/gadget-inc/skills/commits/main").reply(200, { sha: "new-sha" });

  nock("https://raw.githubusercontent.com")
    .get(/\/gadget-inc\/skills\//)
    .times(2)
    .reply(200, function () {
      const urlPath = this.req.path;
      return `# content of ${urlPath.split("/").pop()}`;
    });
};

describe("agent-plugin", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("prints usage when no subcommand is given", async () => {
    await agentPlugin.run(testCtx, makeArgs(agentPlugin.args, "agent-plugin"));

    expectStdout().toContain("ggt agent-plugin install");
    expectStdout().toContain("ggt agent-plugin update");
  });

  it("prints usage for unknown subcommand", async () => {
    await agentPlugin.run(testCtx, makeArgs(agentPlugin.args, "agent-plugin", "foo"));

    expectStdout().toContain("ggt agent-plugin install");
  });

  describe("update", () => {
    it("force-reinstalls AGENTS.md and skills", async () => {
      const directory = await makeProject("update-force");
      await fs.outputFile(directory.absolute("AGENTS.md"), "old\n");
      await fs.outputFile(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"), "old\n");

      mockAgentsDownload();
      mockTreeAndDownloads();

      process.chdir(directory.path);
      await agentPlugin.run(testCtx, makeArgs(agentPlugin.args, "agent-plugin", "update"));

      expect(await fs.readFile(directory.absolute("AGENTS.md"), "utf8")).toBe("# AGENTS\n");
      const content = await fs.readFile(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"), "utf8");
      expect(content).not.toBe("old\n");
      expectStdout().toContain("AGENTS.md installed");
      expectStdout().toContain("Installed skills:");
    });

    it("works as a fresh install when nothing exists", async () => {
      const directory = await makeProject("update-fresh");

      mockAgentsDownload();
      mockTreeAndDownloads();

      process.chdir(directory.path);
      await agentPlugin.run(testCtx, makeArgs(agentPlugin.args, "agent-plugin", "update"));

      expect(await fs.pathExists(directory.absolute("AGENTS.md"))).toBe(true);
      expect(await fs.pathExists(directory.absolute(".agents/skills/gadget-best-practices/SKILL.md"))).toBe(true);
    });
  });
});
