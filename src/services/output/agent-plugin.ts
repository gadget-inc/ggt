import fs from "fs-extra";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { config } from "../config/config.js";
import { confirm } from "./confirm.js";
import { output } from "./output.js";
import { println } from "./print.js";
import { sprint } from "./sprint.js";

// ── Constants ──────────────────────────────────────────────────────────

const AGENTS_FILE = "AGENTS.md";
const CLAUDE_FILE = "CLAUDE.md";
const AGENTS_MD_URL = "https://raw.githubusercontent.com/gadget-inc/skills/main/agents/AGENTS.md";

const SENTINEL_SKILL = "gadget-best-practices";
const SKILLS_REPO = "gadget-inc/skills";
const SKILLS_PREFIX = "skills/gadget/";

// ── Shared helpers ─────────────────────────────────────────────────────

const projectHash = (projectRoot: string): string => {
  const root = path.resolve(projectRoot);
  return crypto
    .createHash("md5")
    .update(config.windows ? root.toLowerCase() : root)
    .digest("hex")
    .slice(0, 16);
};

const optOutPath = (projectRoot: string, prefix: string): string => {
  return path.join(config.cacheDir, `${prefix}${projectHash(projectRoot)}`);
};

// ── AGENTS.md install ──────────────────────────────────────────────────

const downloadAgentsMd = async (agentsPath: string): Promise<void> => {
  const res = await fetch(AGENTS_MD_URL, {
    headers: { "User-Agent": "ggt", Accept: "text/plain" },
  });

  if (!res.ok) {
    throw new Error(`Failed to download ${AGENTS_MD_URL}: ${res.status}`);
  }

  const text = await res.text();
  await fs.outputFile(agentsPath, text.endsWith("\n") ? text : `${text}\n`);
};

export const installAgentsMdScaffold = async ({ projectRoot, force }: { projectRoot: string; force?: boolean }): Promise<boolean> => {
  const agentsPath = path.join(projectRoot, AGENTS_FILE);
  const claudePath = path.join(projectRoot, CLAUDE_FILE);

  if (!force && (await fs.pathExists(agentsPath))) {
    return true;
  }

  try {
    await downloadAgentsMd(agentsPath);
  } catch {
    println({
      ensureEmptyLineAbove: true,
      content: sprint`{red Installation failed.} Try again by running: {cyanBright ggt agent-plugin install}`,
    });
    return false;
  }

  if (config.windows) {
    println({
      ensureEmptyLineAbove: true,
      content: sprint`To link {cyanBright ${CLAUDE_FILE}} → {cyanBright ${AGENTS_FILE}} on Windows, you may need Developer Mode.

Try in PowerShell:
  {cyanBright New-Item -ItemType SymbolicLink -Path ${CLAUDE_FILE} -Target ${AGENTS_FILE}}`,
    });
  } else {
    try {
      await fs.remove(claudePath);
      await fs.symlink(AGENTS_FILE, claudePath);
    } catch {
      println({
        ensureEmptyLineAbove: true,
        content: sprint`Couldn't create {cyanBright ${CLAUDE_FILE}} symlink.

Try:
  {cyanBright ln -sf ${AGENTS_FILE} ${CLAUDE_FILE}}`,
      });
    }
  }

  return true;
};

export const maybePromptAgentsMd = async ({ projectRoot }: { projectRoot: string }): Promise<void> => {
  if (!output.isInteractive || config.logFormat === "json") return;
  if (await fs.pathExists(path.join(projectRoot, AGENTS_FILE))) return;

  const optOut = optOutPath(projectRoot, "opt_out-agents-md-hint-");
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

  await installAgentsMdScaffold({ projectRoot, force: true });
};

// ── Gadget skills install ──────────────────────────────────────────────

type InstallResult = { ok: true; skillNames: string[] } | { ok: false; reason: string };

type GitHubTreeEntry = {
  path: string;
  type: string;
  sha: string;
};

export async function installGadgetSkillsIntoProject(opts: { projectRoot: string; ref?: string }): Promise<InstallResult> {
  const { projectRoot, ref = "main" } = opts;

  try {
    const treeUrl = `https://api.github.com/repos/${SKILLS_REPO}/git/trees/${ref}?recursive=1`;
    const treeRes = await fetch(treeUrl, {
      headers: { "User-Agent": "ggt", Accept: "application/vnd.github+json" },
    });
    if (!treeRes.ok) {
      return { ok: false, reason: `Failed to fetch skill tree: HTTP ${treeRes.status}` };
    }

    const treeData = (await treeRes.json()) as { tree: GitHubTreeEntry[] };
    const blobs = treeData.tree.filter((e) => e.type === "blob" && e.path.startsWith(SKILLS_PREFIX));
    if (blobs.length === 0) {
      return { ok: false, reason: "No skills found in repository." };
    }

    const skillNames = new Set<string>();
    for (const blob of blobs) {
      const relative = blob.path.slice(SKILLS_PREFIX.length);
      if (relative.includes("..") || relative.startsWith("/")) continue;
      skillNames.add(relative.split("/")[0]!);
    }

    // Download to temp dir first to avoid half-installs
    const tmpDir = path.join(projectRoot, ".agents", `.tmp-gadget-skills-${Date.now()}`);
    await fs.ensureDir(tmpDir);

    try {
      for (const blob of blobs) {
        const relative = blob.path.slice(SKILLS_PREFIX.length);
        if (relative.includes("..") || relative.startsWith("/")) continue;

        const destPath = path.join(tmpDir, relative);
        if (!path.resolve(destPath).startsWith(path.resolve(tmpDir))) continue;

        const rawUrl = `https://raw.githubusercontent.com/${SKILLS_REPO}/${ref}/${blob.path}`;
        const res = await fetch(rawUrl, { headers: { "User-Agent": "ggt" } });
        if (!res.ok) {
          throw new Error(`Failed to download ${blob.path}: HTTP ${res.status}`);
        }

        await fs.ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, await res.text());
      }

      const skillsDir = path.join(projectRoot, ".agents/skills");
      for (const name of skillNames) {
        const src = path.join(tmpDir, name);
        const dest = path.join(skillsDir, name);
        await fs.remove(dest);
        await fs.move(src, dest, { overwrite: true });
      }
    } finally {
      await fs.remove(tmpDir).catch(() => undefined);
    }

    return { ok: true, skillNames: [...skillNames] };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function ensureProjectClaudeSkillSymlinks(opts: { projectRoot: string; skillNames: string[] }): Promise<void> {
  const { projectRoot, skillNames } = opts;
  const claudeSkillsDir = path.join(projectRoot, ".claude/skills");

  try {
    await fs.ensureDir(claudeSkillsDir);

    for (const skillName of skillNames) {
      const target = path.join(projectRoot, ".agents/skills", skillName);
      const linkPath = path.join(claudeSkillsDir, skillName);

      try {
        const existing = await fs.readlink(linkPath);
        if (path.resolve(path.dirname(linkPath), existing) === path.resolve(target)) continue;
      } catch {
        // not a symlink or doesn't exist
      }

      await fs.remove(linkPath);

      if (os.platform() === "win32") {
        await fs.symlink(target, linkPath, "junction");
      } else {
        await fs.symlink(path.relative(path.dirname(linkPath), target), linkPath);
      }
    }
  } catch {
    // Never crash — symlinks are best-effort
  }
}

export const maybePromptGadgetSkills = async ({ projectRoot }: { projectRoot: string }): Promise<void> => {
  if (!output.isInteractive || config.logFormat === "json") return;
  if (await fs.pathExists(path.join(projectRoot, ".agents/skills", SENTINEL_SKILL, "SKILL.md"))) return;

  const optOut = optOutPath(projectRoot, "opt_out-gadget-skills-hint-");
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

  const result = await installGadgetSkillsIntoProject({ projectRoot });
  if (!result.ok) {
    println({
      ensureEmptyLineAbove: true,
      content: sprint`{red Installation failed.} ${result.reason}`,
    });
    return;
  }

  await ensureProjectClaudeSkillSymlinks({ projectRoot, skillNames: result.skillNames });
};
