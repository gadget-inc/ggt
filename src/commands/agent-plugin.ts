import chalk from "chalk";
import { execa } from "execa";
import fs from "fs-extra";
import ms from "ms";
import os from "node:os";
import path from "node:path";
import { HTTPError } from "got";
import { z } from "zod";
import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";
import type { Directory } from "../services/filesync/directory.js";
import { loadSyncJsonDirectory, SyncJsonState, type SyncJson } from "../services/filesync/sync-json.js";
import { http } from "../services/http/http.js";
import { Confirm } from "../services/output/confirm.js";
import { output } from "../services/output/output.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";

const AGENT_PLUGIN_REPO = "gadget-inc/skills";
const AGENT_PLUGIN_TAGS_URL = `https://api.github.com/repos/${AGENT_PLUGIN_REPO}/tags`;
const AGENT_PLUGIN_SKILLS_DIR = ".claude/skills";

const TagsResponse = z.array(z.object({ name: z.string() }));

type AgentPluginProject = {
  directory: Directory;
  syncJsonPath: string;
  state: SyncJsonState;
};

type ExtractedAgentPlugin = {
  tag: string;
  tempDir: string;
  skillsRoot: string;
  skillNames: string[];
  cleanup: () => Promise<void>;
};

export const args = {
  "--force": Boolean,
} satisfies ArgsDefinition;

export const usage: Usage = () => {
  return sprint`
  Install and update Gadget agent plugins for Claude.

  {gray Usage}
    ggt agent-plugin install
    ggt agent-plugin update

  {gray Options}
    --force    Overwrite existing skills when installing
  `;
};

export const run: Run<typeof args> = async (ctx, args) => {
  switch (args._[0]) {
    case "install":
      await installAgentPluginsCommand(ctx, { force: args["--force"] });
      break;
    case "update":
      await updateAgentPluginsCommand(ctx);
      break;
    default:
      println(usage(ctx));
  }
};

export const maybeLoadAgentPluginProject = async (ctx: Context, cwd = process.cwd()): Promise<AgentPluginProject | undefined> => {
  const directory = await loadSyncJsonDirectory(cwd);
  const syncJsonPath = directory.absolute(".gadget/sync.json");

  let rawState: string;
  try {
    rawState = await fs.readFile(syncJsonPath, "utf8");
  } catch (error) {
    ctx.log.trace("agent plugin sync.json missing", { error });
    return undefined;
  }

  try {
    const state = SyncJsonState.parse(JSON.parse(rawState));
    return { directory, syncJsonPath, state };
  } catch (error) {
    ctx.log.warn("agent plugin sync.json invalid", { error });
    return undefined;
  }
};

export const fetchLatestAgentPluginTag = async (ctx: Context): Promise<string> => {
  try {
    const tags = await http({
      context: { ctx },
      method: "GET",
      url: AGENT_PLUGIN_TAGS_URL,
      responseType: "json",
      resolveBodyOnly: true,
      timeout: { request: ms("5s") },
    });

    const parsed = TagsResponse.parse(tags);
    if (parsed.length === 0) {
      throw new ArgError("No releases found for agent plugins.");
    }

    return parsed[0].name;
  } catch (error) {
    if (error instanceof ArgError) {
      throw error;
    }
    throw toAgentPluginFetchError(error);
  }
};

export const promptToInstallAgentPlugins = async (ctx: Context, syncJson: SyncJson): Promise<void> => {
  const state = syncJson.state.agentPlugin ?? {};
  if (state.version || state.declined) {
    return;
  }

  if (!output.isInteractive) {
    return;
  }

  const shouldInstall = await promptYesNo(sprint`
    Would you like to install Gadget agent plugins?
    These help Claude understand Gadget best practices.
  `);

  if (!shouldInstall) {
    syncJson.state.agentPlugin = { ...state, declined: true };
    await syncJson.save(syncJson.filesVersion);
    return;
  }

  const project = buildProjectFromSyncJson(syncJson);
  await installAgentPlugins(ctx, { project, force: false, allowOverwritePrompt: true });
};

export const installAgentPlugins = async (
  ctx: Context,
  {
    project,
    force,
    allowOverwritePrompt,
  }: {
    project: AgentPluginProject;
    force: boolean;
    allowOverwritePrompt: boolean;
  },
): Promise<void> => {
  const installedVersion = project.state.agentPlugin?.version;
  if (installedVersion) {
    println({
      ensureEmptyLineAbove: true,
      content: `Agent plugins already installed (${installedVersion}). Use \"ggt agent-plugin update\" to update.`,
    });
    return;
  }

  const skillsDir = project.directory.absolute(AGENT_PLUGIN_SKILLS_DIR);
  if (!(await confirmOverwriteIfNeeded(ctx, { skillsDir, force, allowOverwritePrompt }))) {
    return;
  }

  const latestTag = await fetchLatestAgentPluginTag(ctx);
  let extracted: ExtractedAgentPlugin | undefined;

  try {
    extracted = await downloadAndExtractAgentPlugin(ctx, latestTag);

    await copySkillDirectories({
      sourceRoot: extracted.skillsRoot,
      targetRoot: skillsDir,
      skillNames: extracted.skillNames,
    });

    project.state.agentPlugin = { version: latestTag };
    await saveAgentPluginProject(project);

    const skillsList = extracted.skillNames.map((name) => `  • ${name}`).join("\n");
    const summary = `${chalk.greenBright(symbol.tick)} Installed agent plugins (${latestTag})`;
    println({
      ensureEmptyLineAbove: true,
      content: skillsList ? `${summary}\n${skillsList}` : summary,
    });
  } finally {
    await extracted?.cleanup();
  }
};

export const updateAgentPlugins = async (ctx: Context, project: AgentPluginProject): Promise<void> => {
  const installedVersion = project.state.agentPlugin?.version;
  if (!installedVersion) {
    throw new ArgError("Agent plugins not installed. Run \"ggt agent-plugin install\" first.");
  }

  const latestTag = await fetchLatestAgentPluginTag(ctx);
  if (latestTag === installedVersion) {
    println({ ensureEmptyLineAbove: true, content: `Agent plugins already up to date (${installedVersion}).` });
    return;
  }

  let currentRelease: ExtractedAgentPlugin | undefined;
  let latestRelease: ExtractedAgentPlugin | undefined;

  try {
    const [currentResult, latestResult] = await Promise.allSettled([
      downloadAndExtractAgentPlugin(ctx, installedVersion),
      downloadAndExtractAgentPlugin(ctx, latestTag),
    ]);

    if (currentResult.status === "fulfilled") {
      currentRelease = currentResult.value;
    }

    if (latestResult.status === "fulfilled") {
      latestRelease = latestResult.value;
    }

    if (currentResult.status === "rejected" || latestResult.status === "rejected") {
      throw currentResult.status === "rejected" ? currentResult.reason : latestResult.reason;
    }

    const localSkillsDir = project.directory.absolute(AGENT_PLUGIN_SKILLS_DIR);
    const modifiedFiles = await findModifiedFiles({
      expectedRoot: currentRelease.skillsRoot,
      localRoot: localSkillsDir,
      managedSkillNames: currentRelease.skillNames,
    });

    if (modifiedFiles.length > 0) {
      throw new ArgError(sprint`
        Cannot update: local modifications detected

        Modified files:
          • ${modifiedFiles.join("\n          • ")}

        Please back up your changes, then run "ggt agent-plugin update" again.
      `);
    }

    await removeSkillDirectories({ localRoot: localSkillsDir, skillNames: currentRelease.skillNames });
    await copySkillDirectories({
      sourceRoot: latestRelease.skillsRoot,
      targetRoot: localSkillsDir,
      skillNames: latestRelease.skillNames,
    });

    project.state.agentPlugin = { version: latestTag };
    await saveAgentPluginProject(project);

    println({
      ensureEmptyLineAbove: true,
      content: `${chalk.greenBright(symbol.tick)} Updated agent plugins (${installedVersion} → ${latestTag})`,
    });
  } finally {
    await Promise.all([currentRelease?.cleanup(), latestRelease?.cleanup()].filter(Boolean));
  }
};

const installAgentPluginsCommand = async (ctx: Context, { force }: { force: boolean }): Promise<void> => {
  const project = await loadAgentPluginProject(ctx);
  await installAgentPlugins(ctx, { project, force, allowOverwritePrompt: true });
};

const updateAgentPluginsCommand = async (ctx: Context): Promise<void> => {
  const project = await loadAgentPluginProject(ctx);
  await updateAgentPlugins(ctx, project);
};

const loadAgentPluginProject = async (ctx: Context, cwd = process.cwd()): Promise<AgentPluginProject> => {
  const project = await maybeLoadAgentPluginProject(ctx, cwd);
  if (!project) {
    throw new ArgError("Run this command from a Gadget project directory.");
  }
  return project;
};

const buildProjectFromSyncJson = (syncJson: SyncJson): AgentPluginProject => {
  return {
    directory: syncJson.directory,
    syncJsonPath: syncJson.directory.absolute(".gadget/sync.json"),
    state: syncJson.state,
  };
};

const saveAgentPluginProject = async (project: AgentPluginProject): Promise<void> => {
  await fs.outputJSON(project.syncJsonPath, project.state, { spaces: 2 });
};

const confirmOverwriteIfNeeded = async (
  ctx: Context,
  {
    skillsDir,
    force,
    allowOverwritePrompt,
  }: {
    skillsDir: string;
    force: boolean;
    allowOverwritePrompt: boolean;
  },
): Promise<boolean> => {
  if (!(await fs.pathExists(skillsDir))) {
    return true;
  }

  const entries = await fs.readdir(skillsDir);
  if (entries.length === 0) {
    return true;
  }

  if (force) {
    return true;
  }

  if (!allowOverwritePrompt || !output.isInteractive) {
    throw new ArgError("Existing skills were found in .claude/skills. Re-run with --force to overwrite them.");
  }

  ctx.log.info("prompting for agent plugin overwrite", { skillsDir });
  return await promptYesNo(sprint`
    Existing skills were found in .claude/skills.
    Installing will overwrite them. Continue?
  `);
};

const promptYesNo = async (content: string): Promise<boolean> => {
  if (!output.isInteractive) {
    return false;
  }

  return await new Promise((resolve) => {
    const prompt = new Confirm({ content, exitWhenNo: false });
    prompt.on("submit", (value) => resolve(Boolean(value)));
    prompt.on("abort", () => resolve(false));
    prompt.on("exit", () => resolve(false));
  });
};

const toAgentPluginFetchError = (error: unknown): ArgError => {
  if (isRateLimitError(error)) {
    return new ArgError("GitHub API rate limit exceeded. Try again later.");
  }

  return new ArgError("Failed to fetch agent plugins. Check your network connection.");
};

const isRateLimitError = (error: unknown): error is HTTPError => {
  return (
    error instanceof HTTPError &&
    error.response.statusCode === 403 &&
    error.response.headers["x-ratelimit-remaining"] === "0"
  );
};

const downloadAndExtractAgentPlugin = async (ctx: Context, tag: string): Promise<ExtractedAgentPlugin> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ggt-agent-plugin-"));
  const tarballPath = path.join(tempDir, `${tag}.tar.gz`);

  try {
    const tarball = await http({
      context: { ctx },
      method: "GET",
      url: `https://github.com/${AGENT_PLUGIN_REPO}/archive/refs/tags/${tag}.tar.gz`,
      responseType: "buffer",
      resolveBodyOnly: true,
      timeout: { request: ms("30s") },
    });

    await fs.writeFile(tarballPath, tarball);
    await execa("tar", ["-xzf", tarballPath, "-C", tempDir]);

    const skillsRoot = path.join(tempDir, `skills-${stripTagPrefix(tag)}`, "skills", "gadget");
    if (!(await fs.pathExists(skillsRoot))) {
      throw new ArgError("Failed to fetch agent plugins. Check your network connection.");
    }

    const skillNames = await listSkillDirectories(skillsRoot);

    return {
      tag,
      tempDir,
      skillsRoot,
      skillNames,
      cleanup: () => fs.remove(tempDir),
    };
  } catch (error) {
    await fs.remove(tempDir);
    if (error instanceof ArgError) {
      throw error;
    }
    throw toAgentPluginFetchError(error);
  }
};

const listSkillDirectories = async (skillsRoot: string): Promise<string[]> => {
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
};

const copySkillDirectories = async ({
  sourceRoot,
  targetRoot,
  skillNames,
}: {
  sourceRoot: string;
  targetRoot: string;
  skillNames: string[];
}): Promise<void> => {
  await fs.ensureDir(targetRoot);
  await Promise.all(
    skillNames.map(async (skill) => {
      await fs.copy(path.join(sourceRoot, skill), path.join(targetRoot, skill), { overwrite: true });
    }),
  );
};

const removeSkillDirectories = async ({
  localRoot,
  skillNames,
}: {
  localRoot: string;
  skillNames: string[];
}): Promise<void> => {
  await Promise.all(skillNames.map((skill) => fs.remove(path.join(localRoot, skill))));
};

const findModifiedFiles = async ({
  expectedRoot,
  localRoot,
  managedSkillNames,
}: {
  expectedRoot: string;
  localRoot: string;
  managedSkillNames: string[];
}): Promise<string[]> => {
  const modified = new Set<string>();
  const expectedFiles = new Set<string>();

  for await (const relativePath of walkFiles(expectedRoot, expectedRoot)) {
    expectedFiles.add(relativePath);

    const expectedPath = path.join(expectedRoot, relativePath);
    const localPath = path.join(localRoot, relativePath);

    let localStat;
    try {
      localStat = await fs.stat(localPath);
    } catch {
      modified.add(relativePath);
      continue;
    }

    if (!localStat.isFile()) {
      modified.add(relativePath);
      continue;
    }

    const [expectedBuffer, localBuffer] = await Promise.all([fs.readFile(expectedPath), fs.readFile(localPath)]);
    if (!expectedBuffer.equals(localBuffer)) {
      modified.add(relativePath);
    }
  }

  for (const skillName of managedSkillNames) {
    const localSkillRoot = path.join(localRoot, skillName);
    if (!(await fs.pathExists(localSkillRoot))) {
      continue;
    }

    for await (const relativePath of walkFiles(localSkillRoot, localRoot)) {
      if (!expectedFiles.has(relativePath)) {
        modified.add(relativePath);
      }
    }
  }

  return Array.from(modified).sort();
};

const walkFiles = async function* (dir: string, root: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(entryPath, root);
    } else if (entry.isFile()) {
      const relativePath = path.relative(root, entryPath);
      yield relativePath.split(path.sep).join("/");
    }
  }
};

const stripTagPrefix = (tag: string): string => {
  return tag.startsWith("v") ? tag.slice(1) : tag;
};
