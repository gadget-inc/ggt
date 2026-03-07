import { AppIdentityArgs } from "../command/app-identity-args.js";
import type { ArgsDefinition, ArgsDefinitionResult } from "../command/arg.js";
import { sprint } from "../output/sprint.js";

/**
 * Args definition for commands that operate on a sync directory
 * (.gadget/sync.json). Extends {@link AppIdentityArgs} with
 * --allow-different-app and --allow-unknown-directory flags.
 *
 * Extracted to a dedicated module so that lightweight consumers
 * (e.g. `status.ts`, shell-completion introspection) can reference the
 * args shape without pulling in the heavyweight `sync-json.ts`
 * dependency graph — avoiding ESM init-ordering issues with parallel
 * dynamic imports.
 */
export const SyncJsonArgs = {
  ...AppIdentityArgs,
  "--allow-different-app": {
    type: Boolean,
    description: "Allow syncing with a different app",
    details: sprint`
      Overrides the app recorded in .gadget/sync.json with the one specified by
      --app. Use this when you want to reuse an existing directory for a
      different app.
    `,
    brief: false,
  },
  "--allow-unknown-directory": {
    type: Boolean,
    description: "Allow syncing to an existing directory",
    details: sprint`
      Normally, a directory must be empty or already contain
      .gadget/sync.json. Use this when you want to initialize sync in a
      directory with existing content.
    `,
    brief: false,
  },
} satisfies ArgsDefinition;

export type SyncJsonArgs = typeof SyncJsonArgs;
export type SyncJsonArgsResult = ArgsDefinitionResult<SyncJsonArgs>;
