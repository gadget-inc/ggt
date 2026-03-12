import terminalLink from "terminal-link";

import { addAction, resolveActionPath } from "../services/add/action.js";
import { addEnvironment, generateDefaultEnvName, switchToNewEnvironment } from "../services/add/environment.js";
import { addFields, parseFieldTarget, parseFieldValues } from "../services/add/field.js";
import { addModel } from "../services/add/model.js";
import { addRoute } from "../services/add/route.js";
import { getGlobalActions, getModels } from "../services/app/app.js";
import { ClientError } from "../services/app/error.js";
import { defineCommand } from "../services/command/command.js";
import { FlagError } from "../services/command/flag.js";
import { loadFileSyncFromCwd } from "../services/command/load.js";
import { SyncJsonFlags } from "../services/filesync/sync-json.js";
import colors from "../services/output/colors.js";
import { println } from "../services/output/print.js";
import { GGTError, IsBug } from "../services/output/report.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";
import { uniq } from "../services/util/collection.js";
import { isGraphQLErrors } from "../services/util/is.js";

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
        const { filesync, syncJson } = await loadFileSyncFromCwd(ctx, { command: "add", flags });
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const modelApiIdentifier = flags._[0]!;

        let modelFieldsList: { name: string; fieldType: string }[] = [];
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

          modelFieldsList = modelFields;
        }

        await addModel(ctx, {
          syncJson,
          filesync,
          modelApiIdentifier,
          fields: modelFieldsList,
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
        const { filesync, syncJson } = await loadFileSyncFromCwd(ctx, { command: "add", flags });
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const path = flags._[0]!;

        const models = await getModels(ctx, syncJson.environment);
        const globalActions = await getGlobalActions(ctx, syncJson.environment);

        const resolved = await resolveActionPath(path, models, globalActions);

        await addAction(ctx, {
          syncJson,
          filesync,
          path: resolved.path,
        });

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
        const { filesync, syncJson } = await loadFileSyncFromCwd(ctx, { command: "add", flags });
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const routeMethod = flags._[0]!;
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const routePath = flags._[1]!;

        await addRoute(ctx, {
          syncJson,
          filesync,
          method: routeMethod,
          path: routePath,
        });

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
        const { filesync, syncJson } = await loadFileSyncFromCwd(ctx, { command: "add", flags });

        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const input = flags._[0]!;

        const parsed = parseFieldTarget(input);

        // Handle missing field definition case with original error message
        if (parsed.problems.includes("Missing field definition")) {
          throw new FlagError("Failed to add field, invalid field definition", { usageHint: false });
        }

        if (parsed.problems.length > 0) {
          throw new FlagError(
            sprint`
              Failed to add field:

                ${parsed.problems.map((p) => `• ${p}`).join("\n")}
            `,
            { usageHint: false },
          );
        }

        await addFields(ctx, {
          syncJson,
          filesync,
          modelApiIdentifier: parsed.modelApiIdentifier,
          fields: [{ name: parsed.fieldName, fieldType: parsed.fieldType }],
        });

        println({ ensureEmptyLineAbove: true, content: `Field ${colors.code(parsed.fieldName)} added successfully.` });
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
        const { syncJson } = await loadFileSyncFromCwd(ctx, { command: "add", flags });

        let newEnvName = flags._[0];
        if (!newEnvName) {
          newEnvName = generateDefaultEnvName();
        }

        await addEnvironment(ctx, {
          syncJson,
          name: newEnvName,
        });

        println({ ensureEmptyLineAbove: true, content: `Environment ${colors.code(newEnvName)} added successfully.` });

        // Switch to newly made env
        await switchToNewEnvironment(ctx, {
          envName: newEnvName,
          command: "pull",
          _flags: flags,
        });
      },
    }),
  }),
});
