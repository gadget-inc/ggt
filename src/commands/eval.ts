import fs from "fs-extra";
import { createRequire } from "node:module";
import path from "node:path";
import { inspect } from "node:util";
import vm from "node:vm";

import type { Application, Environment } from "../services/app/app.js";
import type { Run, Usage } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";

import { Edit } from "../services/app/edit/edit.js";
import { UNPAUSE_ENVIRONMENT_MUTATION } from "../services/app/edit/operation.js";
import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { ArgError, type ArgsDefinition } from "../services/command/arg.js";
import { config } from "../services/config/config.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { loadAuthHeaders } from "../services/http/auth.js";
import { http } from "../services/http/http.js";
import { output } from "../services/output/output.js";
import { println } from "../services/output/print.js";
import { sprint } from "../services/output/sprint.js";

export const args = {
  ...AppIdentityArgs,
  "--allow-writes": { type: Boolean, alias: "-w" },
} satisfies ArgsDefinition;

export const usage: Usage = () => {
  return sprint`
    Evaluates a JavaScript snippet against a Gadget app's API client.

    The snippet receives an {bold api} variable (a pre-constructed Gadget API client
    authenticated as the developer). Results are formatted like Node.js REPL output.
    Writes are disallowed by default; use {bold --allow-writes} to enable them.

    {gray Usage}
          $ ggt eval [options] <snippet>

    {gray Options}
          -a, --app <app_name>         Selects a specific app. Defaults to the app synced to the current directory, if there is one.
          -e, --env <env_name>         Selects a specific environment. Defaults to the environment synced to the current directory, if there is one.
          -w, --allow-writes           Allow write operations (default is read-only)
              --json                   Output result as JSON instead of Node.js inspect format (root flag)

    {gray Examples}
          $ ggt eval 'api.user.findMany()'
          $ ggt eval --app my-app --env staging 'api.user.findFirst()'
          $ ggt eval -a my-app -w 'api.user.delete("123")'
  `;
};

export const run: Run<typeof args> = async (ctx, args) => {
  const snippet = args._[0];
  if (!snippet) {
    throw new ArgError(sprint`
      Missing required snippet argument.

      {gray Usage}
            $ ggt eval [options] <snippet>

      {gray Example}
            $ ggt eval --app my-app 'api.user.findMany()'
    `);
  }

  const directory = await loadSyncJsonDirectory(process.cwd());
  const appIdentity = await AppIdentity.load(ctx, { command: "eval", args, directory });

  const application = appIdentity.application;
  const environment = appIdentity.environment;
  const filesVersion = appIdentity.syncJsonState?.environments[environment.name]?.filesVersion;

  const { client, fn } = await loadClient(ctx, args, snippet, application, environment, filesVersion);

  const execSnippet = async (): Promise<unknown> => {
    try {
      return await fn(client, require);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("GGT_ENVIRONMENT_PAUSED")) {
        ctx.log.info("environment is paused, unpausing and retrying", { environment: environment.name });
        await unpauseEnvironment(ctx, environment);
        return await fn(client, require);
      }
      throw error;
    }
  };

  let result: unknown;
  try {
    result = await execSnippet();
  } catch (error: unknown) {
    ctx.log.debug("snippet execution error", { error });
    const message = error instanceof Error ? error.message : String(error);
    if (config.logFormat === "json") {
      output.writeStdout(JSON.stringify({ error: message }) + "\n");
      process.exitCode = 1;
      return;
    }
    throw new ArgError(sprint`
      Error executing snippet:

        ${message}
    `);
  }

  if (result !== undefined) {
    if (config.logFormat === "json") {
      output.writeStdout(JSON.stringify(result) + "\n");
    } else {
      println(inspect(result, { depth: null, colors: output.isInteractive }));
    }
  }
};

const unpauseEnvironment = async (ctx: Context, environment: Environment): Promise<void> => {
  const edit = new Edit(ctx, environment);
  try {
    const { unpauseEnvironment } = await edit.mutate({ mutation: UNPAUSE_ENVIRONMENT_MUTATION });
    if (unpauseEnvironment.success && !unpauseEnvironment.alreadyActive) {
      ctx.log.info("unpaused environment", { environment: environment.name });
    }
  } finally {
    await edit.dispose();
  }
};

const loadClient = async (
  ctx: Context,
  args: { "--allow-writes"?: boolean },
  snippet: string,
  application: Application,
  environment: Environment,
  filesVersion?: string,
): Promise<{ client: Record<string, unknown>; fn: (...args: unknown[]) => Promise<unknown> }> => {
  let clientSource: string | undefined;

  // Try to read from disk cache if we have a filesVersion
  const cachePath = filesVersion
    ? path.join(config.cacheDir, "client-bundles", `${application.slug}--${environment.name}--${filesVersion}.js`)
    : undefined;

  if (cachePath) {
    try {
      clientSource = await fs.readFile(cachePath, "utf8");
      ctx.log.debug("loaded client source from cache", { cachePath });
    } catch {
      // cache miss, will fetch from server
    }
  }

  // Fetch from server if not cached
  if (!clientSource) {
    const clientUrl = `https://${application.slug}--${environment.name}.${config.domains.app}/api/client/node.js`;
    ctx.log.debug("fetching client source", { clientUrl });

    try {
      clientSource = await http({
        context: { ctx },
        url: clientUrl,
        headers: loadAuthHeaders(ctx),
        resolveBodyOnly: true,
      });
    } catch (error: unknown) {
      ctx.log.error("failed to fetch client source", { error });
      throw new ArgError(sprint`
        Failed to fetch the API client for ${application.slug} (${environment.name}).

        Ensure the app and environment exist and are accessible.
      `);
    }

    // Write to cache if we have a filesVersion
    if (cachePath) {
      try {
        await fs.outputFile(cachePath, clientSource);
        ctx.log.debug("cached client source", { cachePath });
      } catch {
        // cache write failure is non-fatal
      }
    }
  }

  // Load the client module in-memory using vm.runInThisContext
  // This avoids writing a temp file while preserving object identity
  // (unlike vm.createContext which creates a separate realm)
  const require = createRequire(import.meta.url);
  const moduleObj = { exports: {} as Record<string, unknown> };
  const wrapped = vm.runInThisContext(`(function(exports, require, module) {\n${clientSource}\n})`, {
    filename: `${application.slug}--${environment.name}-client.cjs`,
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  wrapped(moduleObj.exports, require, moduleObj);
  const Client = moduleObj.exports["Client"] as (new (options: Record<string, unknown>) => Record<string, unknown>) | undefined;

  if (!Client) {
    throw new ArgError(sprint`
      Failed to load the API client for ${application.slug} (${environment.name}).

      The client bundle did not export a Client constructor.
    `);
  }

  // Construct the client instance with developer auth
  const client = new Client({
    authenticationMode: {
      custom: {
        async processFetch(_url: string, init: Record<string, Record<string, string> | undefined>) {
          const headers = (init["headers"] ??= {});
          const authHeaders = loadAuthHeaders(ctx);
          for (const [key, value] of Object.entries(authHeaders)) {
            headers[key] = value;
          }
          // Tell the Gadget server to authenticate this request as the developer
          headers["x-gadget-client"] = "graphql-playground";
          headers["x-gadget-environment"] = environment.name;
          if (!args["--allow-writes"]) {
            headers["x-gadget-developer-readonly"] = "true";
          }
        },
        async processTransactionConnectionParams(params: Record<string, Record<string, boolean> | undefined>) {
          const auth = (params["auth"] ??= {});
          auth["useAppDeveloperSession"] = true;
        },
      },
    },
  });

  // Parse the snippet into an executable function
  // eslint-disable-next-line no-empty-function, @typescript-eslint/no-unsafe-call
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  let fn: (...args: unknown[]) => Promise<unknown>;
  try {
    // Try as expression first (e.g. 'api.user.findMany()')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    fn = new AsyncFunction("api", "require", `return (\n${snippet}\n)`) as typeof fn;
  } catch {
    try {
      // Fall back to statement (e.g. 'const users = await api.user.findMany(); return users.length')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      fn = new AsyncFunction("api", "require", snippet) as typeof fn;
    } catch (error: unknown) {
      throw new ArgError(sprint`
        Syntax error in snippet:

          ${snippet}

        ${error instanceof Error ? error.message : String(error)}
      `);
    }
  }

  return { client, fn };
};
