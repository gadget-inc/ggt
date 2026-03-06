import { AppArg } from "../app/arg.js";
import { sprint } from "../output/sprint.js";
import type { ArgsDefinition, ArgsDefinitionResult } from "./arg.js";

/**
 * Args definition for --app and --env flags used by commands that need
 * to identify a Gadget application and environment.
 *
 * The `complete` callbacks are lazy wrappers that dynamically import
 * their implementations from `app.ts`. This avoids pulling the
 * heavyweight `app-identity.ts` dependency graph (Edit, user, etc.)
 * into modules that only need the args shape — preventing circular-dep
 * initialization ordering issues observed on Windows.
 */
export const AppIdentityArgs = {
  "--app": {
    type: AppArg,
    alias: ["-a", "--application"],
    description: "Gadget app to use",
    valueName: "app-slug",
    complete: async (ctx: import("./context.js").Context, partial: string, argv: string[]) => {
      const { completeApp } = await import("../app/app.js");
      return completeApp(ctx, partial, argv);
    },
    details: sprint`
      The app slug is the subdomain portion of your app URL (e.g., my-app from
      my-app.gadget.app). Can be omitted when .gadget/sync.json already records
      the app.
    `,
  },
  "--env": {
    type: String,
    alias: ["-e", "--environment"],
    description: "Environment to use",
    valueName: "name",
    complete: async (ctx: import("./context.js").Context, partial: string, argv: string[]) => {
      const { completeEnvironment } = await import("../app/app.js");
      return completeEnvironment(ctx, partial, argv);
    },
    details: sprint`
      Defaults to the development environment. Production is read-only for most
      commands.
    `,
  },
} satisfies ArgsDefinition;

export type AppIdentityArgs = typeof AppIdentityArgs;
export type AppIdentityArgsResult = ArgsDefinitionResult<AppIdentityArgs>;
