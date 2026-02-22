import fs from "fs-extra";
import assert from "node:assert";
import path from "node:path";
import { simpleGit } from "simple-git";
import { z } from "zod";

import type { Run, Usage } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";

import { getApplications, groupByTeam } from "../services/app/app.js";
import { ArgError, parseArgs, type ArgsDefinition, type ArgsDefinitionResult } from "../services/command/arg.js";
import { config } from "../services/config/config.js";
import { Directory } from "../services/filesync/directory.js";
import { FileSync } from "../services/filesync/filesync.js";
import { type SyncJsonState } from "../services/filesync/sync-json-state.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { loadAuthHeaders } from "../services/http/auth.js";
import { http } from "../services/http/http.js";
import { println } from "../services/output/print.js";
import { select } from "../services/output/select.js";
import { spin } from "../services/output/spinner.js";
import { sprint } from "../services/output/sprint.js";
import { textInput } from "../services/output/text-input.js";
import { getUserOrLogin } from "../services/user/user.js";

export const IGNORE_CONTENTS = `dist/
build/
.cache/
.env
.env.local
`;

export const GITIGNORE_CONTENTS = `node_modules/
.env
.env.local
.DS_Store
Thumbs.db
dist/
build/
.cache/
.dl/
`;

export const CreatedApp = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
  slug: z.string(),
  primaryDomain: z.string(),
});

export type CreatedApp = z.infer<typeof CreatedApp>;

const TEMPLATES = ["empty", "web-app-with-auth", "shopify", "internal-tool"] as const;
type Template = (typeof TEMPLATES)[number];

export type InitArgs = typeof args;
export type InitArgsResult = ArgsDefinitionResult<InitArgs>;

export const args = {
  "--fork": { type: Boolean },
  "--template": { type: String, alias: "-t" },
  "--no-typescript": { type: Boolean },
  "--no-git": { type: Boolean },
  "--dir": { type: String },
} satisfies ArgsDefinition;

export const usage: Usage = (_ctx) => {
  return sprint`
    Initialize a new Gadget application.

    {gray Usage}
          ggt init [app-name]

    {gray Options}
          --fork                   Fork an existing app instead of using a template
          -t, --template <name>    Template name or URL
          --no-typescript          Scaffold with JavaScript instead of TypeScript
          --no-git                 Skip git init
          --dir <path>             Target directory (defaults to app name)

    {gray Examples}
          Create a new app interactively
          {cyanBright $ ggt init}

          Create a new app with a specific name
          {cyanBright $ ggt init my-app}

          Create a new app from a template
          {cyanBright $ ggt init my-app --template web}
  `;
};

export const run: Run<typeof args> = async (ctx, args) => {
  await getUserOrLogin(ctx, "init");

  const subdomain = args._[0] ?? (await textInput({ content: "What would you like to name your app?" }));

  let app: CreatedApp;

  if (args["--fork"]) {
    // Fork flow
    const apps = await getApplications(ctx);
    if (apps.length === 0) {
      println({ ensureEmptyLineAbove: true, content: "You don't have any apps to fork." });
      return;
    }

    const sourceSlug = await select({
      content: "Which app would you like to fork?",
      groupedChoices: [...groupByTeam(apps).entries()].map(([team, teamApps]) => [team, teamApps.map((a) => a.slug)]),
      searchable: true,
    });

    const sourceApp = apps.find((a) => a.slug === sourceSlug);
    assert(sourceApp, `app "${sourceSlug}" not found`);

    const json = await http({
      context: { ctx },
      method: "POST",
      url: `https://${config.domains.services}/auth/api/apps`,
      headers: loadAuthHeaders(ctx),
      json: { subdomain, appType: "empty", typescript: true, forkFromAppId: String(sourceApp.id) },
      responseType: "json",
      resolveBodyOnly: true,
    });

    app = CreatedApp.parse(json);
  } else {
    // Create flow
    const template: Template = args["--template"]
      ? (args["--template"] as Template)
      : await select({
          content: "Which template?",
          choices: [...TEMPLATES],
        });

    const typescript = !args["--no-typescript"];

    const json = await http({
      context: { ctx },
      method: "POST",
      url: `https://${config.domains.services}/auth/api/apps`,
      headers: loadAuthHeaders(ctx),
      json: { subdomain, appType: template, typescript },
      responseType: "json",
      resolveBodyOnly: true,
    });

    app = CreatedApp.parse(json);
  }

  println({ ensureEmptyLineAbove: true, content: `Created app "${app.slug}" at https://${app.primaryDomain}` });

  const appSlug = app.slug;
  const appName = args["--dir"] ?? appSlug;
  const targetDir = await resolveTargetDirectory({ dir: args["--dir"], appSlug });
  await writeInitialSyncJson({ targetDir, appSlug });
  await pullInitialFiles(ctx, { targetDir, appSlug });

  // Always write .ignore (controls ggt sync, independent of git)
  await fs.writeFile(path.join(targetDir, ".ignore"), IGNORE_CONTENTS);

  if (!args["--no-git"]) {
    await fs.writeFile(path.join(targetDir, ".gitignore"), GITIGNORE_CONTENTS);
    const git = simpleGit(targetDir);
    await git.init();
    await git.add(".");
    await git.commit("Initial commit from Gadget");
  }

  println({ ensureEmptyLineAbove: true, content: sprint`{green Your app is ready!}` });
  println(sprint`  {gray $} cd ${appName} && ggt dev`);
};

export const resolveTargetDirectory = async (options: { dir?: string; appSlug: string }): Promise<string> => {
  const dirName = options.dir ?? options.appSlug;
  const absolutePath = path.resolve(process.cwd(), dirName);

  if (await fs.pathExists(absolutePath)) {
    const directory = await Directory.init(absolutePath);
    if (await directory.hasFiles()) {
      throw new ArgError(`Directory "${dirName}" already exists and is not empty.`);
    }
  }

  return absolutePath;
};

export const writeInitialSyncJson = async (options: { targetDir: string; appSlug: string }): Promise<void> => {
  const state: SyncJsonState = {
    application: options.appSlug,
    environment: "development",
    environments: {
      development: { filesVersion: "0" },
    },
  };

  await fs.ensureDir(path.join(options.targetDir, ".gadget"));
  await fs.outputJSON(path.join(options.targetDir, ".gadget/sync.json"), state, { spaces: 2 });
};

export const pullInitialFiles = async (ctx: Context, options: { targetDir: string; appSlug: string }): Promise<void> => {
  const directory = await loadSyncJsonDirectory(options.targetDir);
  const syncJsonArgs = parseArgs(SyncJsonArgs, {
    argv: [options.targetDir, `--app=${options.appSlug}`, `--env=development`],
  });
  const syncJson = await SyncJson.loadOrAskAndInit(ctx, { command: "init", args: syncJsonArgs, directory });
  const filesync = new FileSync(syncJson);

  const spinner = spin({ ensureEmptyLineAbove: true, content: "Waiting for your app's environment to be ready." });

  const hashes = await filesync.hashes(ctx, { silent: true });

  if (hashes.environmentChangesToPull.size === 0) {
    spinner.succeed("Your app is ready.");
    return;
  }

  spinner.succeed("Pulling files from your new Gadget app.");

  await filesync.pull(ctx, { hashes, force: true });
};
