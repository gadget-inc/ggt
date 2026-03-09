import { findUp } from "find-up";
import fs from "fs-extra";
import { z } from "zod";

import { allFlagNames, type ArgsDefinition } from "../command/arg.js";
import type { Context } from "../command/context.js";
import { config } from "../config/config.js";
import { SyncJsonState } from "../filesync/sync-json-state.js";
import { maybeLoadAuthHeaders } from "../http/auth.js";
import { http } from "../http/http.js";
import { sprint } from "../output/sprint.js";
import { filterByPrefix, uniq } from "../util/collection.js";
import { Api } from "./api/api.js";
import { GADGET_GLOBAL_ACTIONS_QUERY, GADGET_META_MODELS_QUERY } from "./api/operation.js";
import { AppSlug } from "./arg.js";

export const EnvironmentType = Object.freeze({
  Development: "development",
  Production: "production",
  Test: "test",
});

export type EnvironmentType = keyof typeof EnvironmentType;

export const Environment = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
  name: z.string().transform((name) => name.toLowerCase()),
  type: z.nativeEnum(EnvironmentType),
  nodeVersion: z.string().optional(),
});

export type Environment = z.infer<typeof Environment> & {
  application: Application;
};

export const Application = z.object({
  id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
  slug: z.string(),
  primaryDomain: z.string(),
  environments: z.array(Environment),
  team: z.object({
    id: z.union([z.string(), z.number(), z.bigint()]).transform((v) => BigInt(v)),
    name: z.string(),
  }),
});

export type Application = z.infer<typeof Application>;

export const ModelApiIdentifier = z.object({
  apiIdentifier: z.string(),
  namespace: z.nullable(z.array(z.string())).optional(),
});

export type ModelApiIdentifier = z.infer<typeof ModelApiIdentifier>;

export const GlobalActionApiIdentifier = z.object({
  apiIdentifier: z.string(),
  namespace: z.nullable(z.array(z.string())).optional(),
});

export type GlobalActionApiIdentifier = z.infer<typeof GlobalActionApiIdentifier>;

/**
 * Arg definition for the --app flag.
 */
export const AppArg = {
  type: AppSlug,
  alias: ["-a", "--app"],
  description: "Gadget app to use",
  valueName: "app",
  complete: async (ctx: Context, partial: string, _argv: string[]) => {
    try {
      const apps = await getApplications(ctx);
      return filterByPrefix(
        apps.map((app) => app.slug),
        partial,
      );
    } catch {
      return [];
    }
  },
  details: sprint`
    The app slug is the subdomain portion of your app URL (e.g., my-app from
    my-app.gadget.app). Can be omitted when .gadget/sync.json already records
    the app.
  `,
} satisfies ArgsDefinition[string];

/**
 * Arg definition for the --env flag.
 */
export const EnvArg = {
  type: String,
  alias: ["-e", "--env"],
  description: "Environment to use",
  valueName: "env",
  complete: async (ctx: Context, partial: string, argv: string[]) => {
    try {
      const apps = await getApplications(ctx);
      if (apps.length === 0) return [];

      // Try to determine the app from --app in argv
      let app = findAppFromArgv(apps, argv);

      // Fall back to sync.json in cwd
      if (!app) {
        app = await findAppFromSyncJson(apps);
      }

      if (app) {
        return filterByPrefix(
          app.environments.map((env) => env.name),
          partial,
        );
      }

      // No app determined — return all env names across all apps (deduplicated)
      const allNames = uniq(apps.flatMap((a) => a.environments.map((e) => e.name)));
      return filterByPrefix(allNames, partial);
    } catch {
      return [];
    }
  },
  details: sprint`
    Defaults to the development environment. Production is read-only for most
    commands.
  `,
} satisfies ArgsDefinition[string];

/**
 * Retrieves a list of apps for the given user. If the user is not
 * logged in, an empty array is returned instead.
 *
 * @param ctx - The current context.
 * @returns A promise that resolves to an array of Application objects.
 */
export const getApplications = async (ctx: Context): Promise<Application[]> => {
  const headers = maybeLoadAuthHeaders(ctx);
  if (!headers) {
    return [];
  }

  const json = await http({
    context: { ctx },
    url: `https://${config.domains.services}/auth/api/apps`,
    headers: { ...headers },
    responseType: "json",
    resolveBodyOnly: true,
  });

  return z.array(Application).parse(json);
};

export const groupByTeam = (apps: Application[]): Map<string, Application[]> => {
  const teamMap = new Map<string, Application[]>();
  for (const app of apps) {
    const teamName = app.team.name;
    const teamApps = teamMap.get(teamName) ?? [];
    teamApps.push(app);
    teamMap.set(teamName, teamApps);
  }
  return teamMap;
};

export const getModels = async (ctx: Context, environment: Environment): Promise<ModelApiIdentifier[] | []> => {
  const headers = maybeLoadAuthHeaders(ctx);
  if (!headers) {
    return [];
  }

  const api = new Api(ctx, environment);
  const { gadgetMeta } = await api.query({ query: GADGET_META_MODELS_QUERY });
  return gadgetMeta.models;
};

const appFlagNames = new Set(allFlagNames("--application", AppArg));

const findAppFromArgv = (apps: Application[], argv: string[]): Application | undefined => {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (appFlagNames.has(arg)) {
      const slug = argv[i + 1];
      if (slug) {
        return apps.find((a) => a.slug === slug);
      }
    }
    // handle --flag=value
    const eqIdx = arg.indexOf("=");
    if (eqIdx > 0 && appFlagNames.has(arg.slice(0, eqIdx))) {
      const slug = arg.slice(eqIdx + 1);
      if (slug) {
        return apps.find((a) => a.slug === slug);
      }
    }
  }
  return undefined;
};

const findAppFromSyncJson = async (apps: Application[]): Promise<Application | undefined> => {
  try {
    const syncJsonPath = await findUp(".gadget/sync.json");
    if (!syncJsonPath) return undefined;
    const content = await fs.readFile(syncJsonPath, "utf8");
    const state = SyncJsonState.parse(JSON.parse(content));
    return apps.find((a) => a.slug === state.application);
  } catch {
    // no sync.json or invalid
  }
  return undefined;
};

export const getGlobalActions = async (ctx: Context, environment: Environment): Promise<GlobalActionApiIdentifier[] | []> => {
  const headers = maybeLoadAuthHeaders(ctx);
  if (!headers) {
    return [];
  }

  const api = new Api(ctx, environment);
  const { gadgetMeta } = await api.query({ query: GADGET_GLOBAL_ACTIONS_QUERY });
  return gadgetMeta.globalActions;
};
