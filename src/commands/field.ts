import { addFields, parseFieldTarget } from "../services/add/field.ts";
import { REMOVE_MODEL_FIELD_MUTATION, RENAME_MODEL_FIELD_MUTATION } from "../services/app/edit/operation.ts";
import { ClientError, formatClientErrorForUser } from "../services/app/error.ts";
import { defineCommand } from "../services/command/command.ts";
import { FlagError } from "../services/command/flag.ts";
import { setupCommandSync } from "../services/filesync/setup-sync.ts";
import { SyncJsonFlags } from "../services/filesync/sync-json.ts";
import colors from "../services/output/colors.ts";
import { confirm } from "../services/output/confirm.ts";
import { println } from "../services/output/print.ts";
import { sprint } from "../services/output/sprint.ts";
import { symbol } from "../services/output/symbols.ts";

const supportedFieldTypes = [
  "number",
  "string",
  "richText",
  "email",
  "url",
  "color",
  "json",
  "enum",
  "boolean",
  "dateTime",
  "vector",
  "file",
  "encryptedString",
  "computed",
  "belongsTo",
  "hasOne",
  "hasMany",
  "hasManyThrough",
  "password",
  "roleList",
  "money",
  "recordState",
] as const;

export default defineCommand({
  name: "field",
  description: "Manage fields on your models",
  details: sprint`
    Field commands sync local files with the environment before making schema
    changes. ${colors.subdued("ggt field add")} mirrors ${colors.subdued("ggt add field")} behavior.
  `,
  examples: [
    "ggt field add post/title:string",
    "ggt field add mystore/order/note:string",
    "ggt field remove post/title",
    "ggt field rename post/title post/heading",
  ],
  flags: SyncJsonFlags,
  subcommands: (sub) => ({
    add: sub({
      description: "Add a field to an existing model",
      details: sprint`
        Uses the format ${colors.subdued("model/field:type")} to identify the target model and the
        field to add. Supported types include ${supportedFieldTypes.join(", ")}.
      `,
      examples: [
        "ggt field add post/published:boolean",
        "ggt field add user/age:number",
        "ggt field add post/title:string",
        "ggt field add user/email:email",
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
        const { filesync, syncJson } = await setupCommandSync(ctx, "field", flags);

        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const input = flags._[0]!;

        const parsed = parseFieldTarget(input);

        // Keep legacy add-field error wording for parity with `ggt add field`.
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

        if (!parsed.fieldType) {
          throw new FlagError("Failed to add field, invalid field definition", { usageHint: false });
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
    remove: sub({
      description: "Remove a field from a model",
      examples: ["ggt field remove post/title", "ggt field remove post/title --force"],
      positionals: [
        {
          name: "model/field",
          required: true,
          description: "Model path and field name",
          details: "Format is model/field (e.g. post/title).",
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
        const { filesync, syncJson } = await setupCommandSync(ctx, "field", flags);

        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const input = flags._[0]!;
        const parsed = parseFieldTarget(input);
        if (parsed.problems.length > 0) {
          throw new FlagError(parsed.problems.join("\n"), { usageHint: false });
        }

        if (!flags["--force"]) {
          await confirm(`Remove ${parsed.fieldName} from ${parsed.modelApiIdentifier}?`);
        }

        let result;
        try {
          result = (
            await syncJson.edit.mutate({
              mutation: REMOVE_MODEL_FIELD_MUTATION,
              variables: { path: parsed.modelApiIdentifier, field: parsed.fieldName },
            })
          ).removeModelField;
        } catch (error) {
          if (error instanceof ClientError) {
            throw new FlagError(formatClientErrorForUser(error), { usageHint: false });
          }
          throw error;
        }

        await filesync.writeToLocalFilesystem(ctx, {
          filesVersion: result.remoteFilesVersion,
          files: result.changed,
          delete: result.deleted.map((file) => file.path),
        });

        println({
          ensureEmptyLineAbove: true,
          content: `${colors.created(symbol.tick)} Removed ${colors.code(parsed.fieldName)} from ${colors.code(parsed.modelApiIdentifier)}.`,
        });
      },
    }),
    rename: sub({
      description: "Rename a field on a model",
      examples: ["ggt field rename post/title post/heading", "ggt field rename shopify/order/note shopify/order/internalNote"],
      positionals: [
        {
          name: "model/field",
          required: true,
          description: "Current model path and field name",
          details: "Format is model/field (e.g. post/title).",
        },
        {
          name: "model/new-field-name",
          required: true,
          description: "Model path and new field name",
          details: "Format is model/newField (e.g. post/heading). Must reference the same model.",
        },
      ],
      run: async (ctx, flags) => {
        const { filesync, syncJson } = await setupCommandSync(ctx, "field", flags);

        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const sourceInput = flags._[0]!;
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const targetInput = flags._[1]!;

        const source = parseFieldTarget(sourceInput);
        if (source.problems.length > 0) {
          throw new FlagError(source.problems.join("\n"), { usageHint: false });
        }

        const target = parseFieldTarget(targetInput);
        if (target.problems.length > 0) {
          throw new FlagError(target.problems.join("\n"), { usageHint: false });
        }

        if (source.modelApiIdentifier !== target.modelApiIdentifier) {
          throw new FlagError(
            `Both paths must reference the same model. Got ${colors.code(source.modelApiIdentifier)} and ${colors.code(target.modelApiIdentifier)}.`,
            { usageHint: false },
          );
        }

        if (source.fieldName === target.fieldName) {
          throw new FlagError("New field name must be different from the existing name.", { usageHint: false });
        }

        let result;
        try {
          result = (
            await syncJson.edit.mutate({
              mutation: RENAME_MODEL_FIELD_MUTATION,
              variables: { path: source.modelApiIdentifier, field: source.fieldName, newName: target.fieldName },
            })
          ).renameModelField;
        } catch (error) {
          if (error instanceof ClientError) {
            throw new FlagError(formatClientErrorForUser(error), { usageHint: false });
          }
          throw error;
        }

        await filesync.writeToLocalFilesystem(ctx, {
          filesVersion: result.remoteFilesVersion,
          files: result.changed,
          delete: result.deleted.map((file) => file.path),
        });

        println({
          ensureEmptyLineAbove: true,
          content: `${colors.created(symbol.tick)} Renamed ${colors.code(source.fieldName)} to ${colors.code(target.fieldName)} on ${colors.code(source.modelApiIdentifier)}.`,
        });
      },
    }),
  }),
});
