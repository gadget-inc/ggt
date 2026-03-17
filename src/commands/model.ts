import path from "node:path";

import fs from "fs-extra";
import terminalLink from "terminal-link";

import { parseFieldValues } from "../services/add/field.ts";
import { addModel } from "../services/add/model.ts";
import { defineCommand } from "../services/command/command.ts";
import { FlagError } from "../services/command/flag.ts";
import { setupCommandSync } from "../services/filesync/setup-sync.ts";
import { SyncJson, SyncJsonFlags } from "../services/filesync/sync-json.ts";
import colors from "../services/output/colors.ts";
import { confirm } from "../services/output/confirm.ts";
import { println } from "../services/output/print.ts";
import { sprint } from "../services/output/sprint.ts";
import { symbol } from "../services/output/symbols.ts";

const modelPathToDirectory = (modelPath: string): string => `api/models/${modelPath}`;

const removeEmptyModelParentDirectories = async (syncJson: SyncJson, modelPath: string): Promise<void> => {
  const modelsRoot = syncJson.directory.absolute("api/models");
  let current = path.dirname(syncJson.directory.absolute(modelPathToDirectory(modelPath)));

  while (current.startsWith(modelsRoot) && current !== modelsRoot) {
    try {
      await fs.rmdir(current);
    } catch {
      break;
    }

    current = path.dirname(current);
  }
};

const markModelRenameChanges = (
  changes: Map<string, { type: string; oldPath?: string }>,
  oldModelPath: string,
  newModelPath: string,
): void => {
  const oldDirectoryPath = `${modelPathToDirectory(oldModelPath)}/`;
  const newDirectoryPath = `${modelPathToDirectory(newModelPath)}/`;

  const oldChange = changes.get(oldDirectoryPath);
  const newChange = changes.get(newDirectoryPath);

  if (!oldChange || oldChange.type !== "delete" || !newChange || newChange.type !== "create") {
    return;
  }

  changes.set(newDirectoryPath, { ...newChange, oldPath: oldDirectoryPath });
  changes.delete(oldDirectoryPath);
};

export default defineCommand({
  name: "model",
  description: "Add and manage models in your app",
  details: sprint`
    Model commands sync local files with the environment before making schema
    changes. Use add to scaffold models, remove for destructive deletion, and
    rename to move a model path.
  `,
  examples: ["ggt model add post", "ggt model remove post --force", "ggt model rename post article"],
  flags: SyncJsonFlags,
  subcommands: (sub) => ({
    add: sub({
      description: "Add a model to your app",
      examples: ["ggt model add post", "ggt model add blog/post", "ggt model add post title:string body:string"],
      positionals: [
        {
          name: "name",
          required: true,
          description: "Model path",
        },
        {
          name: "field:type ...",
          description: "Optional field definitions",
        },
      ],
      run: async (ctx, flags) => {
        const { filesync, syncJson } = await setupCommandSync(ctx, "model", flags);
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const modelApiIdentifier = flags._[0]!;

        let fields: { name: string; fieldType: string }[] = [];
        if (flags._.length > 1) {
          const [modelFields, problems] = parseFieldValues(flags._.slice(1));

          if (problems.length > 0) {
            throw new FlagError(
              sprint`
                Failed to add model:

                  ${problems.map((p) => `• ${p}`).join("\n")}
              `,
              { usageHint: false },
            );
          }

          fields = modelFields;
        }

        await addModel(ctx, {
          syncJson,
          filesync,
          modelApiIdentifier,
          fields,
        });

        const modelPrintout = terminalLink.isSupported
          ? terminalLink(
              modelApiIdentifier,
              `https://${syncJson.environment.application.primaryDomain}/edit/${syncJson.environment.name}/model/${modelApiIdentifier}/schema`,
            )
          : modelApiIdentifier;

        println({ ensureEmptyLineAbove: true, content: colors.subdued("New model created in environment.") });
        println({
          ensureEmptyLineAbove: true,
          content: `${colors.created(symbol.tick)} Model ${colors.code(modelPrintout)} added successfully.`,
        });
      },
    }),
    remove: sub({
      description: "Remove a model from your app",
      examples: ["ggt model remove post", "ggt model remove post --force"],
      positionals: [
        {
          name: "name",
          required: true,
          description: "Model path",
        },
      ],
      flags: {
        "--force": {
          type: Boolean,
          alias: "-f",
          description: "Skip confirmation",
        },
      },
      run: async (ctx, flags) => {
        const { filesync, syncJson } = await setupCommandSync(ctx, "model", flags);
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const modelPath = flags._[0]!;

        const relativeModelDirectory = modelPathToDirectory(modelPath);
        const modelDirectory = syncJson.directory.absolute(relativeModelDirectory);

        if (!(await fs.pathExists(modelDirectory))) {
          throw new FlagError(`${modelPath} does not exist.`, { usageHint: false });
        }

        if (!flags["--force"]) {
          await confirm(`Delete ${modelPath} and all of its data?`);
        }

        await fs.remove(modelDirectory);
        await removeEmptyModelParentDirectories(syncJson, modelPath);

        const hashes = await filesync.hashes(ctx, { silent: true });
        await filesync.push(ctx, { command: "model", hashes });

        println({ ensureEmptyLineAbove: true, content: `${colors.created(symbol.tick)} Removed ${colors.code(modelPath)}.` });
      },
    }),
    rename: sub({
      description: "Rename a model",
      examples: ["ggt model rename post article", "ggt model rename blog/post blog/article"],
      positionals: [
        {
          name: "name",
          required: true,
          description: "Current model path",
        },
        {
          name: "new-name",
          required: true,
          description: "New model path",
        },
      ],
      run: async (ctx, flags) => {
        const { filesync, syncJson } = await setupCommandSync(ctx, "model", flags);
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const modelPath = flags._[0]!;
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const newModelPath = flags._[1]!;

        if (modelPath === newModelPath) {
          throw new FlagError("New model path must be different from the existing path.", { usageHint: false });
        }

        const currentDirectory = syncJson.directory.absolute(modelPathToDirectory(modelPath));
        const nextDirectory = syncJson.directory.absolute(modelPathToDirectory(newModelPath));

        if (!(await fs.pathExists(currentDirectory))) {
          throw new FlagError(`${modelPath} does not exist.`, { usageHint: false });
        }

        if (await fs.pathExists(nextDirectory)) {
          throw new FlagError(`${newModelPath} already exists.`, { usageHint: false });
        }

        await fs.ensureDir(path.dirname(nextDirectory));
        await fs.move(currentDirectory, nextDirectory);
        await removeEmptyModelParentDirectories(syncJson, modelPath);

        const hashes = await filesync.hashes(ctx, { silent: true });
        markModelRenameChanges(hashes.localChangesToPush, modelPath, newModelPath);

        await filesync.push(ctx, { command: "model", hashes });

        println({
          ensureEmptyLineAbove: true,
          content: `${colors.created(symbol.tick)} Renamed ${colors.code(modelPath)} to ${colors.code(newModelPath)}.`,
        });
      },
    }),
  }),
});
