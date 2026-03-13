import terminalLink from "terminal-link";

import { getGlobalActions, getModels } from "../services/app/app.ts";
import {
  CREATE_ACTION_MUTATION,
  CREATE_ENVIRONMENT_MUTATION,
  CREATE_MODEL_FIELDS_MUTATION,
  CREATE_MODEL_MUTATION,
  CREATE_ROUTE_MUTATION,
} from "../services/app/edit/operation.ts";
import { ClientError } from "../services/app/error.ts";
import { defineCommand } from "../services/command/command.ts";
import type { Context } from "../services/command/context.ts";
import { FlagError, type FlagsResult } from "../services/command/flag.ts";
import { UnknownDirectoryError } from "../services/filesync/error.ts";
import { FileSync } from "../services/filesync/filesync.ts";
import { SyncJson, SyncJsonFlags, loadSyncJsonDirectory } from "../services/filesync/sync-json.ts";
import colors from "../services/output/colors.ts";
import { println } from "../services/output/print.ts";
import { GGTError, IsBug } from "../services/output/report.ts";
import { select } from "../services/output/select.ts";
import { sprint } from "../services/output/sprint.ts";
import { symbol } from "../services/output/symbols.ts";
import { ts } from "../services/output/timestamp.ts";
import { uniq } from "../services/util/collection.ts";
import { isGraphQLErrors } from "../services/util/is.ts";

export class AddClientError extends GGTError {
  isBug = IsBug.NO;

  constructor(error: ClientError) {
    let template = "";

    if (isGraphQLErrors(error.cause)) {
      const errors = uniq(error.cause.map((x) => x.message));
      template = sprint`
        ${errors
          .flatMap((e) => e.split("\n"))
          .map((line) => (line.startsWith("\u2022 ") ? line : `\u2022 ${line}`))
          .join("\n")}
      `;
    } else {
      template = sprint`${error.cause}`;
    }

    super(template);
  }

  protected override render(): string {
    return sprint`
      ${colors.deleted(symbol.cross)} Failed to add:
       ${this.message}
    `;
  }
}

type AddFlagsResult = FlagsResult<typeof SyncJsonFlags>;

const setupAddSync = async (ctx: Context, flags: AddFlagsResult): Promise<{ filesync: FileSync }> => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { command: "add", flags, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError({ command: "add", flags, directory });
  }

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx, { silent: true });

  if (!hashes.inSync) {
    await filesync.merge(ctx, {
      hashes,
      printEnvironmentChangesOptions: { limit: 5 },
      printLocalChangesOptions: { limit: 5 },
      silent: true,
    });
  }

  println({ ensureEmptyLineAbove: true, content: `${colors.created(symbol.tick)} Sync completed ${ts()}` });

  return { filesync };
};

const parseFieldValues = (fields: string[]): [{ name: string; fieldType: string }[], problems: string[]] => {
  const problems: string[] = [];
  const modelFields: { name: string; fieldType: string }[] = [];

  for (const field of fields) {
    const matches = /^(.*):+(.*)$/.exec(field);
    if (!matches || matches.length !== 3 || !matches[1] || !matches[2]) {
      problems.push(sprint`${field} is not a valid field definition`);
    } else {
      modelFields.push({ name: matches[1].replace(/:+/g, ""), fieldType: matches[2] });
    }
  }

  return [modelFields, problems];
};

export default defineCommand({
  name: "add",
  description: "Add resources to your app",
  details: sprint`
    Syncs local files with the environment before adding the resource, ensuring the
    environment is up to date. If there are conflicts, they must be resolved before the
    resource can be added.
  `,
  sections: [
    {
      title: "Resource Syntax",
      content: sprint`
        ggt add model <model_name> [field_name:field_type ...]
        Fields are optional. Each field is a name:type pair (e.g. title:string).

        ggt add action <context>/<action_name>
        context is either "model/<model_name>" for model actions or "action" for global actions.

        ggt add route <method> <route_path>
        method is an HTTP verb: GET, POST, PUT, PATCH, or DELETE.

        ggt add field <model_name>/<field_name>:<field_type>
        Adds a field to an existing model.
      `,
    },
  ],
  examples: [
    "ggt add model post",
    "ggt add model post title:string body:string",
    "ggt add field post/published:boolean",
    "ggt add action model/post/publish",
    "ggt add action action/audit",
    "ggt add route GET /hello",
    "ggt add environment staging",
  ],
  flags: SyncJsonFlags,
  subcommands: (sub) => ({
    model: sub({
      description: "Add a new data model",
      details: sprint`
        Creates the model on your environment and pulls the generated files to your
        local directory. Optionally include field definitions as ${colors.subdued("name:type")} pairs
        after the model name. Supported types include string, number, boolean,
        datetime, json, email, url, vector, richtext, file, enum, and color.
      `,
      examples: ["ggt add model post", "ggt add model post title:string body:string", "ggt add model user name:string email:string"],
      positionals: [
        {
          name: "model",
          required: true,
          description: "API identifier for the new model",
          details: "Becomes the API identifier in your client code (e.g. api.post). Must be unique within the app.",
        },
        {
          name: "field:type ...",
          description: "Optional field definitions (name:type pairs)",
          details: "Each field is a name:type pair separated by a colon (e.g. title:string).",
        },
      ],
      run: async (ctx, flags) => {
        const { filesync } = await setupAddSync(ctx, flags);
        const syncJson = filesync.syncJson;
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const modelApiIdentifier = flags._[0]!;

        const modelFieldsList: { name: string; fieldType: string }[] = [];
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

          modelFieldsList.push(...modelFields);
        }

        let result;

        try {
          result = (
            await syncJson.edit.mutate({
              mutation: CREATE_MODEL_MUTATION,
              variables: {
                path: modelApiIdentifier,
                fields: modelFieldsList.map((fields) => ({ name: fields.name, fieldType: fields.fieldType })),
              },
            })
          ).createModel;
        } catch (error) {
          if (error instanceof ClientError) {
            throw new AddClientError(error);
          } else {
            throw error;
          }
        }

        println({ ensureEmptyLineAbove: true, content: colors.subdued("New model created in environment.") });

        await filesync.writeToLocalFilesystem(ctx, { filesVersion: result.remoteFilesVersion, files: result.changed, delete: [] });

        const modelPrintout = terminalLink.isSupported
          ? terminalLink(
              modelApiIdentifier,
              `https://${syncJson.environment.application.primaryDomain}/edit/${syncJson.environment.name}/model/${modelApiIdentifier}/schema`,
            )
          : modelApiIdentifier;

        println({
          ensureEmptyLineAbove: true,
          content: `${colors.created(symbol.tick)} Model ${colors.code(modelPrintout)} added successfully.`,
        });
      },
    }),
    action: sub({
      description: "Add an action to a model or as a global action",
      details: sprint`
        The path determines whether the action is added to a model or as a global
        action. Use ${colors.subdued("model/<model>/<action>")} for model actions or
        ${colors.subdued("action/<action>")} for global actions. If the path is ambiguous because
        a model and action namespace share the same name, you'll be prompted to
        choose.
      `,
      examples: ["ggt add action model/post/publish", "ggt add action action/audit", "ggt add action model/user/sendEmail"],
      positionals: [
        {
          name: "path",
          required: true,
          description: "Action path (e.g. model/post/publish or action/audit)",
          details: "If the path is ambiguous because a model and action namespace share the same name, you'll be prompted to choose.",
        },
      ],
      run: async (ctx, flags) => {
        const { filesync } = await setupAddSync(ctx, flags);
        const syncJson = filesync.syncJson;
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const path = flags._[0]!;

        const models = await getModels(ctx, syncJson.environment);
        const globalActions = await getGlobalActions(ctx, syncJson.environment);
        const splitPath = path.split("/");

        let overrideContextAction: "models" | "actions" | undefined;

        const parsedPaths = splitPath.length > 1 ? splitPath.slice(0, splitPath.length - 1) : splitPath;
        const parsedAction = splitPath[splitPath.length - 1];

        const conflictingModel = models.find((model) => {
          const modelName = parsedPaths[parsedPaths.length - 1];

          return (
            model.apiIdentifier.toUpperCase() === modelName.toUpperCase() &&
            model.namespace?.join("/") === parsedPaths.slice(0, parsedPaths.length - 1).join("/")
          );
        });

        const conflictingActionNamespace = globalActions.find((action) => {
          return action.namespace?.join("/") === parsedPaths.join("/");
        });

        if (conflictingModel && conflictingActionNamespace) {
          const joinedParsedPaths = parsedPaths.join("/");
          overrideContextAction = await select({
            choices: ["models", "actions"] as const,
            content: sprint`
              ${colors.header("Namespace Conflict:")} The action '${parsedAction}.js' cannot be automatically added due to a namespace conflict.

              How would you like to proceed?:
            `,
            formatChoice: (choice) => {
              switch (choice) {
                case "models": {
                  return `As a Model action in ${colors.subdued(`models/${joinedParsedPaths}/${parsedAction}.js`)}`;
                }
                case "actions": {
                  return `As an Action in ${colors.subdued(`actions/${joinedParsedPaths}/${parsedAction}.js`)}`;
                }
              }
            },
          });

          println({
            ensureEmptyLineAbove: true,
            content: sprint`${colors.renamed(symbol.info)} You can override the context of the action by specifying the context in the path. For example: ${colors.subdued(`ggt add action ${overrideContextAction}/${path}`)}`,
          });
        }

        try {
          const result = (
            await syncJson.edit.mutate({
              mutation: CREATE_ACTION_MUTATION,
              variables: { path: overrideContextAction ? `${overrideContextAction}/` + path : path },
            })
          ).createAction;

          await filesync.writeToLocalFilesystem(ctx, { filesVersion: result.remoteFilesVersion, files: result.changed, delete: [] });
        } catch (error) {
          if (error instanceof ClientError) {
            throw new AddClientError(error);
          } else {
            throw error;
          }
        }

        println({ ensureEmptyLineAbove: true, content: `Action ${colors.code(path)} added successfully.` });
      },
    }),
    route: sub({
      description: "Add an HTTP route",
      details: sprint`
        Creates the route handler file on the environment and pulls it to your
        local directory. Supported methods are GET, POST, PUT, PATCH, and DELETE.
      `,
      examples: [
        "ggt add route GET /hello",
        "ggt add route POST /webhooks/stripe",
        "ggt add route DELETE /posts/:id",
        "ggt add route PUT /users/:id",
      ],
      positionals: [
        {
          name: "method",
          required: true,
          description: "HTTP method (GET, POST, PUT, PATCH, DELETE)",
          details: "Case-insensitive.",
        },
        {
          name: "path",
          required: true,
          description: "Route path",
          details: "The URL path for the route handler (e.g. /hello, /webhooks/stripe). Leading slash is required.",
        },
      ],
      run: async (ctx, flags) => {
        const { filesync } = await setupAddSync(ctx, flags);
        const syncJson = filesync.syncJson;
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const routeMethod = flags._[0]!;
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const routePath = flags._[1]!;

        try {
          const result = (
            await syncJson.edit.mutate({ mutation: CREATE_ROUTE_MUTATION, variables: { method: routeMethod, path: routePath } })
          ).createRoute;

          await filesync.writeToLocalFilesystem(ctx, { filesVersion: result.remoteFilesVersion, files: result.changed, delete: [] });
        } catch (error) {
          if (error instanceof ClientError) {
            throw new AddClientError(error);
          } else {
            throw error;
          }
        }

        println({ ensureEmptyLineAbove: true, content: `Route ${colors.code(routePath)} added successfully.` });
      },
    }),
    field: sub({
      description: "Add a field to an existing model",
      details: sprint`
        Uses the format ${colors.subdued("model/field:type")} to identify the target model and the
        field to add. Supported types include string, number, boolean, datetime,
        json, email, url, vector, richtext, file, enum, and color.
      `,
      examples: [
        "ggt add field post/published:boolean",
        "ggt add field user/age:number",
        "ggt add field post/title:string",
        "ggt add field user/email:email",
      ],
      positionals: [
        {
          name: "model/field:type",
          required: true,
          description: "Model path and field definition",
          details: "Format is model/field:type (e.g. post/published:boolean).",
        },
      ],
      run: async (ctx, flags) => {
        const { filesync } = await setupAddSync(ctx, flags);
        const syncJson = filesync.syncJson;

        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const splitPathAndField = flags._[0]!.split("/");

        const modelFieldsList: { name: string; fieldType: string }[] = [];

        if (splitPathAndField[1]) {
          const [modelFields, problems] = parseFieldValues([splitPathAndField[1]]);

          if (problems.length > 0) {
            throw new FlagError(
              sprint`
                Failed to add field:

                  ${problems.map((p) => `• ${p}`).join("\n")}
              `,
              { usageHint: false },
            );
          }

          modelFieldsList.push(...modelFields);
        } else {
          throw new FlagError("Failed to add field, invalid field definition", { usageHint: false });
        }

        try {
          const result = (
            await syncJson.edit.mutate({
              mutation: CREATE_MODEL_FIELDS_MUTATION,
              variables: {
                // oxlint-disable-next-line no-non-null-assertion
                path: splitPathAndField[0]!,
                fields: modelFieldsList.map((field) => ({ name: field.name, fieldType: field.fieldType })),
              },
            })
          ).createModelFields;

          await filesync.writeToLocalFilesystem(ctx, { filesVersion: result.remoteFilesVersion, files: result.changed, delete: [] });
        } catch (error) {
          if (error instanceof ClientError) {
            throw new AddClientError(error);
          } else {
            throw error;
          }
        }

        println({ ensureEmptyLineAbove: true, content: `Field ${colors.code(modelFieldsList[0]?.name)} added successfully.` });
      },
    }),
    environment: sub({
      aliases: ["env"],
      description: "Create a new environment by cloning",
      details: sprint`
        Clones the current environment's data and schema into a new environment.
        If no name is given, one is auto-generated. After creation, automatically
        pulls from the new environment to switch your local directory to it.

        For more control (e.g. choosing the source environment or skipping the
        auto-switch), use ${colors.subdued("ggt env create")} instead.
      `,
      examples: ["ggt add environment staging", "ggt add environment"],
      positionals: [
        {
          name: "name",
          description: "Name for the new environment (auto-generated if omitted)",
          details: "The name is lowercased automatically. If omitted, a timestamped name is generated (e.g. env-20260303-142530).",
        },
      ],
      run: async (ctx, flags) => {
        const { filesync } = await setupAddSync(ctx, flags);
        const syncJson = filesync.syncJson;
        let newEnvName = flags._[0];
        if (!newEnvName) {
          const now = new Date();
          const pad = (n: number): string => String(n).padStart(2, "0");
          const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
          // getUTCHours() returns 0 at midnight (yielding "00"), unlike the prior
          // toLocaleTimeString approach which returned "24:xx".
          const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
          newEnvName = `env-${date}-${time}`;
        }

        try {
          await syncJson.edit.mutate({
            mutation: CREATE_ENVIRONMENT_MUTATION,
            variables: { environment: { slug: newEnvName, sourceSlug: syncJson.environment.name } },
          });
        } catch (error) {
          if (error instanceof ClientError) {
            throw new AddClientError(error);
          } else {
            throw error;
          }
        }

        println({ ensureEmptyLineAbove: true, content: `Environment ${colors.code(newEnvName)} added successfully.` });

        // Try to switch to newly made env
        const pullFromNewEnvSyncJson = await SyncJson.load(ctx, {
          command: "pull",
          flags: {
            _: [],
            "--application": undefined,
            "--allow-unknown-directory": undefined,
            "--allow-different-app": undefined,
            "--environment": newEnvName,
          },
          directory: await loadSyncJsonDirectory(process.cwd()),
        });
        if (pullFromNewEnvSyncJson) {
          const filesync = new FileSync(pullFromNewEnvSyncJson);
          const hashes = await filesync.hashes(ctx);
          if (hashes.environmentChangesToPull.size === 0) {
            println({ ensureEmptyLineAbove: true, content: "Nothing to pull." });
            return;
          }
          if (hashes.localChangesToPush.size > 0) {
            // show them the local changes they will discard
            await filesync.print(ctx, { hashes });
          }
          await filesync.pull(ctx, { hashes, force: true });
        }
      },
    }),
  }),
});
