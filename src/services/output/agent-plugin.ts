import fs from "fs-extra";
import ms from "ms";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import pMap from "p-map";

import type { Context } from "../command/context.js";

import { config } from "../config/config.js";
import { Directory } from "../filesync/directory.js";
import { http } from "../http/http.js";
import { confirm } from "./confirm.js";
import { output } from "./output.js";
import { println } from "./print.js";
import { sprint } from "./sprint.js";

const AGENTS_FILE = "AGENTS.md";
const CLAUDE_FILE = "CLAUDE.md";
const AGENTS_MD_URL = "https://raw.githubusercontent.com/gadget-inc/skills/main/agents/AGENTS.md";

const SENTINEL_SKILL = "gadget-best-practices";
const SKILLS_REPO = "gadget-inc/skills";
const SKILLS_PREFIX = "skills/gadget/";

const HTTP_TIMEOUT = ms("10s");

const projectHash = (directory: Directory): string => {
  const root = path.resolve(directory.path);
  return crypto
    .createHash("md5")
    .update(config.windows ? root.toLowerCase() : root)
    .digest("hex")
    .slice(0, 16);
};

const optOutPath = (directory: Directory, prefix: string): string => {
  return path.join(config.cacheDir, `${prefix}${projectHash(directory)}`);
};

export const installAgentsMdScaffold = async ({
  ctx,
  directory,
  force,
}: {
  ctx: Context;
  directory: Directory;
  force?: boolean;
}): Promise<void> => {
  const agentsPath = directory.absolute(AGENTS_FILE);
  const claudePath = directory.absolute(CLAUDE_FILE);

  const agentsExists = await fs.pathExists(agentsPath);
  const claudeExists = await fs.lstat(claudePath).then(
    () => true,
    () => false,
  );

  if (!force && (agentsExists || claudeExists)) {
    println({ content: sprint`{gray ✓} Agent scaffold already exists (reinstall with {cyanBright ggt agent-plugin install --force})` });
    return;
  }

  try {
    const text = await http({
      context: { ctx },
      method: "GET",
      url: AGENTS_MD_URL,
      headers: { Accept: "text/plain" },
      timeout: { request: HTTP_TIMEOUT },
    }).text();
    await fs.outputFile(agentsPath, text.endsWith("\n") ? text : `${text}\n`);
  } catch {
    println({
      ensureEmptyLineAbove: true,
      content: sprint`{red Failed to install AGENTS.md.} Try again: {cyanBright ggt agent-plugin install}`,
    });
    return;
  }

  println({ content: sprint`{greenBright ✓} AGENTS.md installed` });

  try {
    if (force) await fs.remove(claudePath);
    await fs.symlink(AGENTS_FILE, claudePath);
  } catch {
    if (config.windows) {
      println({
        content: sprint`To link {cyanBright ${CLAUDE_FILE}} → {cyanBright ${AGENTS_FILE}} on Windows, you may need Developer Mode.

Try in PowerShell:
  {cyanBright New-Item -ItemType SymbolicLink -Path ${CLAUDE_FILE} -Target ${AGENTS_FILE}}`,
      });
    } else {
      println({
        content: sprint`Couldn't create {cyanBright ${CLAUDE_FILE}} symlink.

Try:
  {cyanBright ln -sf ${AGENTS_FILE} ${CLAUDE_FILE}}`,
      });
    }
  }
};

export const maybePromptAgentsMd = async ({ ctx, directory }: { ctx: Context; directory: Directory }): Promise<void> => {
  if (!output.isInteractive || config.logFormat === "json") return;
  if (await fs.pathExists(directory.absolute(AGENTS_FILE))) return;
  if (
    await fs.lstat(directory.absolute(CLAUDE_FILE)).then(
      () => true,
      () => false,
    )
  )
    return;

  const optOut = optOutPath(directory, "opt_out-agents-md-hint-");
  if (await fs.pathExists(optOut)) return;

  const yes = await confirm({
    exitWhenNo: false,
    ensureEmptyLineAbove: true,
    ensureNewLine: true,
    content: `Add ${AGENTS_FILE} to this project for your coding agent?`,
  });

  if (!yes) {
    await fs.outputFile(optOut, "1").catch(() => undefined);
    return;
  }

  await installAgentsMdScaffold({ ctx, directory });
};

type GitHubTreeEntry = {
  path: string;
  type: string;
  sha: string;
};

export const installGadgetSkillsIntoProject = async ({
  ctx,
  directory,
  ref = "main",
  force,
}: {
  ctx: Context;
  directory: Directory;
  ref?: string;
  force?: boolean;
}): Promise<void> => {
  const sentinelPath = directory.absolute(".agents/skills", SENTINEL_SKILL, "SKILL.md");

  if (!force && (await fs.pathExists(sentinelPath))) {
    println({ content: sprint`{gray ✓} Gadget skills already installed (reinstall with {cyanBright ggt agent-plugin install --force})` });
    return;
  }

  let skillNames: string[];

  try {
    const treeUrl = `https://api.github.com/repos/${SKILLS_REPO}/git/trees/${ref}?recursive=1`;
    const treeData = await http({
      context: { ctx },
      method: "GET",
      url: treeUrl,
      headers: { Accept: "application/vnd.github+json" },
      responseType: "json",
      resolveBodyOnly: true,
      timeout: { request: HTTP_TIMEOUT },
    });

    const { tree } = treeData as { tree: GitHubTreeEntry[] };
    const blobs = tree.filter((e) => e.type === "blob" && e.path.startsWith(SKILLS_PREFIX));
    if (blobs.length === 0) {
      throw new Error("No skills found in repository.");
    }

    const names = new Set<string>();
    for (const blob of blobs) {
      const relative = blob.path.slice(SKILLS_PREFIX.length);
      if (relative.includes("..") || relative.startsWith("/")) continue;
      names.add(relative.split("/")[0] as string);
    }

    const tmpDir = directory.absolute(".agents", `.tmp-gadget-skills-${Date.now()}`);
    await fs.ensureDir(tmpDir);

    try {
      await pMap(
        blobs,
        async (blob) => {
          const relative = blob.path.slice(SKILLS_PREFIX.length);
          if (relative.includes("..") || relative.startsWith("/")) return;

          const destPath = path.join(tmpDir, relative);
          if (!path.resolve(destPath).startsWith(path.resolve(tmpDir))) return;

          const rawUrl = `https://raw.githubusercontent.com/${SKILLS_REPO}/${ref}/${blob.path}`;
          const text = await http({
            context: { ctx },
            method: "GET",
            url: rawUrl,
            timeout: { request: HTTP_TIMEOUT },
          }).text();

          await fs.ensureDir(path.dirname(destPath));
          await fs.writeFile(destPath, text);
        },
        { concurrency: 5 },
      );

      const skillsDir = directory.absolute(".agents/skills");
      for (const name of names) {
        const src = path.join(tmpDir, name);
        const dest = path.join(skillsDir, name);
        await fs.remove(dest);
        await fs.move(src, dest, { overwrite: true });
      }
    } finally {
      await fs.remove(tmpDir).catch(() => undefined);
    }

    skillNames = [...names];
  } catch (error) {
    println({
      ensureEmptyLineAbove: true,
      content: sprint`{red Failed to install skills.} ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  println({ content: sprint`{greenBright ✓} Installed skills: ${skillNames.join(", ")}` });

  try {
    const claudeSkillsDir = directory.absolute(".claude/skills");
    await fs.ensureDir(claudeSkillsDir);

    for (const skillName of skillNames) {
      const target = directory.absolute(".agents/skills", skillName);
      const linkPath = path.join(claudeSkillsDir, skillName);

      try {
        const existing = await fs.readlink(linkPath);
        if (path.resolve(path.dirname(linkPath), existing) === path.resolve(target)) continue;
      } catch {}

      await fs.remove(linkPath);

      if (os.platform() === "win32") {
        await fs.symlink(target, linkPath, "junction");
      } else {
        await fs.symlink(path.relative(path.dirname(linkPath), target), linkPath);
      }
    }

    println({ content: sprint`{greenBright ✓} Symlinks created in .claude/skills/` });
  } catch (error) {
    println({
      content: sprint`{yellow ⚠} Failed to create .claude/skills/ symlinks: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

export const maybePromptGadgetSkills = async ({ ctx, directory }: { ctx: Context; directory: Directory }): Promise<void> => {
  if (!output.isInteractive || config.logFormat === "json") return;
  if (await fs.pathExists(directory.absolute(".agents/skills", SENTINEL_SKILL, "SKILL.md"))) return;

  const optOut = optOutPath(directory, "opt_out-gadget-skills-hint-");
  if (await fs.pathExists(optOut)) return;

  const yes = await confirm({
    exitWhenNo: false,
    ensureEmptyLineAbove: true,
    ensureNewLine: true,
    content: "Install Gadget agent skills for your coding agent?",
  });

  if (!yes) {
    await fs.outputFile(optOut, "1").catch(() => undefined);
    return;
  }

  await installGadgetSkillsIntoProject({ ctx, directory, force: true });
};
