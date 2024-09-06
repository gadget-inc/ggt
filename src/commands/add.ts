/* eslint-disable no-case-declarations */
import chalk from "chalk";
import terminalLink from "terminal-link";
import { getGlobalActions, getModels } from "../services/app/app.js";
import {
  CREATE_ACTION_MUTATION,
  CREATE_MODEL_FIELDS_MUTATION,
  CREATE_MODEL_MUTATION,
  CREATE_ROUTE_MUTATION,
} from "../services/app/edit/operation.js";
import { ClientError } from "../services/app/error.js";
import { ArgError, type ArgsDefinitionResult } from "../services/command/arg.js";
import type { Run, Usage } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";
import { UnknownDirectoryError } from "../services/filesync/error.js";
import { FileSync } from "../services/filesync/filesync.js";
import { SyncJson, SyncJsonArgs, loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { println } from "../services/output/print.js";
import { GGTError, IsBug } from "../services/output/report.js";
import { select } from "../services/output/select.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";
import { ts } from "../services/output/timestamp.js";
import { uniq } from "../services/util/collection.js";
import { isGraphQLErrors } from "../services/util/is.js";

export class AddClientError extends GGTError {
  isBug = IsBug.NO;

  constructor(error: ClientError) {
    let template = "";

    if (isGraphQLErrors(error.cause)) {
      const errors = uniq(error.cause.map((x) => x.message));

      template = sprint`     • ${errors.map((e) => e.split("\n").join("\n‎     • ")).join("\n")}`; // Why in gods name do I have to put an empty character for the tab to work?
    } else {
      template = sprint`${error.cause}`;
    }

    super(template);
  }

  protected override render(): string {
    return `${chalk.redBright(symbol.cross)} Failed to add:\n ` + this.message;
  }
}

export type AddArgs = typeof args;
export type AddArgsResult = ArgsDefinitionResult<AddArgs>;

export const args = {
  ...SyncJsonArgs,
};

export const usage: Usage = () => {
  return sprint`
  Adds models, fields, actions and routes to your app.

  This command first performs a sync to ensure that your local and environment directories match, changes are tracked since last sync.
  If any conflicts are detected, they must be resolved before adding models, fields, actions or routes.

  {gray Usage}
    ggt add model <model_name> [field_name:field_type ...]

    ggt add action [CONTEXT]/<action_name>
    CONTEXT:Specifies the kind of action. Use "model" for model actions otherwise use "action".

    ggt add route <HTTP_METHOD> <route_path>

    ggt add field <model_path>/<field_name>:<field_type>

  {gray Options}
    -e, --env <env_name> Selects the environment to add to. Default set on ".gadget/sync.json"

  {gray Examples}
    Add a new model 'post' with out fields:
    {cyanBright $ ggt add model modelA}

    Add a new model 'post' with 2 new 'string' type fields 'title' and 'body':
    {cyanBright $ ggt add model post title:string body:string}

    Add new action 'publish' to the 'post' model:
    {cyanBright ggt add action model/post/publish}

    Add a new action 'audit'
    {cyanBright ggt add action action/audit}

    Add a new route 'howdy'
    {cyanBright ggt add route GET howdy}

    Add a new 'boolean' type field 'published' to an existing model
    {cyanBright ggt add field post/published:boolean}
  `;
};

export const run: Run<AddArgs> = async (ctx, args) => {
  const directory = await loadSyncJsonDirectory(process.cwd());
  const syncJson = await SyncJson.load(ctx, { args, directory });
  if (!syncJson) {
    throw new UnknownDirectoryError(ctx, { args, directory });
  }

  const filesync = new FileSync(syncJson);
  const hashes = await filesync.hashes(ctx, true);

  if (!hashes.inSync) {
    await filesync.merge(ctx, {
      hashes,
      printEnvironmentChangesOptions: {
        limit: 5,
      },
      printLocalChangesOptions: {
        limit: 5,
      },
      quietly: true,
    });
  }

  println({ ensureEmptyLineAbove: true, content: `${chalk.greenBright(symbol.tick)} Sync completed ${ts()}` });

  switch (args._[0]) {
    case "model":
      await modelSubCommand(ctx, { args, filesync });
      break;
    case "action":
      await actionSubCommand(ctx, { args, filesync });
      break;
    case "route":
      await routeSubCommand(ctx, { args, filesync });
      break;
    case "field":
      await fieldSubCommand(ctx, { args, filesync });
      break;
    default:
      println(usage(ctx));
      return;
  }
};

const parseFieldValues = (fields: string[]): [{ name: string; fieldType: string }[], problems: string[]] => {
  const problems: string[] = [];
  const modelFields: { name: string; fieldType: string }[] = [];

  fields.forEach((field) => {
    const matches = /^(.*):+(.*)$/.exec(field);
    if (!matches || matches.length !== 3 || !matches[1] || !matches[2]) {
      problems.push(sprint`${field} is not a valid field definition`);
    } else {
      modelFields.push({ name: matches[1].replace(/:+/g, ""), fieldType: matches[2] });
    }
  });

  return [modelFields, problems];
};

const modelSubCommand = async (ctx: Context, { args, filesync }: { args: AddArgsResult; filesync: FileSync }): Promise<void> => {
  const syncJson = filesync.syncJson;
  const modelApiIdentifier = args._[1];

  if (!modelApiIdentifier) {
    throw new ArgError(sprint`Failed to add model, missing model path

    {gray Usage}
        {cyanBright ggt add model <model_name> [field_name:field_type ...]}`);
  }

  const modelFieldsList: { name: string; fieldType: string }[] = [];
  if (args._.length > 2) {
    const [modelFields, problems] = parseFieldValues(args._.slice(2));

    if (problems.length > 0) {
      throw new ArgError(sprint`
        Failed to add model:
             • ${problems.join("\n             • ")}

        {gray Usage}
            {cyanBright ggt add model ${modelApiIdentifier} [field_name:field_type ...]}`);
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
          fields: modelFieldsList.map((fields) => ({
            name: fields.name,
            fieldType: fields.fieldType,
          })),
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

  println({ ensureEmptyLineAbove: true, content: chalk.gray("New model created in environment.") });

  await filesync.writeToLocalFilesystem(ctx, {
    filesVersion: result.remoteFilesVersion,
    files: result.changed,
    delete: [],
  });

  const modelPrintout = terminalLink.isSupported
    ? terminalLink(modelApiIdentifier, `https://${syncJson.app.primaryDomain}/edit/${syncJson.env.name}/model/${modelApiIdentifier}/schema`)
    : modelApiIdentifier;

  println({
    ensureEmptyLineAbove: true,
    content: `${chalk.greenBright(symbol.tick)} Model ${chalk.cyanBright(modelPrintout)} added successfully.`,
  });
};

const actionSubCommand = async (ctx: Context, { args, filesync }: { args: AddArgsResult; filesync: FileSync }): Promise<void> => {
  const syncJson = filesync.syncJson;
  const path = args._[1];

  if (!path) {
    throw new ArgError(sprint`Failed to add action, missing action path

  {gray Usage}
      {cyanBright ggt add action [CONTEXT]/<action_name>
      CONTEXT:Specifies the kind of action. Use "model" for model actions otherwise use "action".}`);
  }

  const models = await getModels(ctx);
  const globalActions = await getGlobalActions(ctx);
  const splitPath = path.split("/");

  let overrideContextAction: "models" | "actions" | undefined;

  const parsedPaths = splitPath.length > 1 ? splitPath.slice(0, splitPath.length - 1) : splitPath;
  const parsedAction = splitPath[splitPath.length - 1];

  const conflictingModel = models.find((model) => {
    const modelName = parsedPaths[parsedPaths.length - 1];

    return (
      model.apiIdentifier.toUpperCase() === modelName?.toUpperCase() &&
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
        {bold Namespace Conflict:} The action '${parsedAction}.js' cannot be automatically added due to a namespace conflict.

        How would you like to proceed?:
      `,
      formatChoice: (choice) => {
        switch (choice) {
          case "models": {
            return `As a Model action in ${chalk.gray(`models/${joinedParsedPaths}/${parsedAction}.js`)}`;
          }
          case "actions": {
            return `As an Action in ${chalk.gray(`actions/${joinedParsedPaths}/${parsedAction}.js`)}`;
          }
        }
      },
    });

    println({
      ensureEmptyLineAbove: true,
      content: sprint`${chalk.yellowBright(symbol.info)} You can override the context of the action by specifying the context in the path. For example: {gray ggt add action ${overrideContextAction}/${path}}`,
    });
  }

  try {
    const result = (
      await syncJson.edit.mutate({
        mutation: CREATE_ACTION_MUTATION,
        variables: { path: overrideContextAction ? `${overrideContextAction}/` + path : path },
      })
    ).createAction;

    await filesync.writeToLocalFilesystem(ctx, {
      filesVersion: result.remoteFilesVersion,
      files: result.changed,
      delete: [],
    });
  } catch (error) {
    if (error instanceof ClientError) {
      throw new AddClientError(error);
    } else {
      throw error;
    }
  }

  println({
    ensureEmptyLineAbove: true,
    content: `Action ${chalk.cyanBright(path)} added successfully.`,
  });
};

const routeSubCommand = async (ctx: Context, { args, filesync }: { args: AddArgsResult; filesync: FileSync }): Promise<void> => {
  const syncJson = filesync.syncJson;
  const routeMethod = args._[1];
  const routePath = args._[2];

  if (!routeMethod) {
    throw new ArgError(sprint`Failed to add route, missing route method

    {gray Usage}
        {cyanBright ggt add route <HTTP_METHOD> <route_path>}`);
  }

  if (!routePath) {
    throw new ArgError(sprint`Failed to add route, missing route path

    {gray Usage}
        {cyanBright ggt add route ${routeMethod} <route_path>}`);
  }

  try {
    const result = (
      await syncJson.edit.mutate({
        mutation: CREATE_ROUTE_MUTATION,
        variables: { method: routeMethod, path: routePath },
      })
    ).createRoute;

    await filesync.writeToLocalFilesystem(ctx, {
      filesVersion: result.remoteFilesVersion,
      files: result.changed,
      delete: [],
    });
  } catch (error) {
    if (error instanceof ClientError) {
      throw new AddClientError(error);
    } else {
      throw error;
    }
  }

  println({
    ensureEmptyLineAbove: true,
    content: `Route ${chalk.cyanBright(routePath)} added successfully.`,
  });
};

const fieldSubCommand = async (ctx: Context, { args, filesync }: { args: AddArgsResult; filesync: FileSync }): Promise<void> => {
  const syncJson = filesync.syncJson;

  const splitPathAndField = args._[1]?.split("/");

  if (!splitPathAndField) {
    throw new ArgError(sprint`Failed to add field, invalid field path definition

    {gray Usage}
        {cyanBright ggt add field <model_path>/<field_name>:<field_type>}`);
  }

  const modelFieldsList: { name: string; fieldType: string }[] = [];

  if (splitPathAndField[1]) {
    const [modelFields, problems] = parseFieldValues([splitPathAndField[1]]);

    if (problems.length > 0) {
      throw new ArgError(sprint`
      Failed to add field:
          • ${problems.join("\n    •")}

      {gray Usage}
          {cyanBright ggt add field ${splitPathAndField[0]}/<field_name>:<field_type>}`);
    }

    modelFieldsList.push(...modelFields);
  } else {
    throw new ArgError(sprint`Failed to add field, invalid field definition

    {gray Usage}
        {cyanBright ggt add field ${splitPathAndField[0]}/<field_name>:<field_type>}`);
  }

  try {
    const result = (
      await syncJson.edit.mutate({
        mutation: CREATE_MODEL_FIELDS_MUTATION,
        variables: {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          path: splitPathAndField[0]!,
          fields: modelFieldsList.map((field) => ({
            name: field.name,
            fieldType: field.fieldType,
          })),
        },
      })
    ).createModelFields;

    await filesync.writeToLocalFilesystem(ctx, {
      filesVersion: result.remoteFilesVersion,
      files: result.changed,
      delete: [],
    });
  } catch (error) {
    if (error instanceof ClientError) {
      throw new AddClientError(error);
    } else {
      throw error;
    }
  }

  println({
    ensureEmptyLineAbove: true,
    content: `Field ${chalk.cyanBright(modelFieldsList[0]?.name)} added successfully.`,
  });
};
