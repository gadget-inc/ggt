import { addFields, parseFieldTarget } from "../services/add/field.ts";
import { defineCommand } from "../services/command/command.ts";
import { FlagError } from "../services/command/flag.ts";
import { setupCommandSync } from "../services/filesync/setup-sync.ts";
import { SyncJsonFlags } from "../services/filesync/sync-json.ts";
import colors from "../services/output/colors.ts";
import { println } from "../services/output/print.ts";
import { sprint } from "../services/output/sprint.ts";

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
  examples: ["ggt field add post/title:string", "ggt field add mystore/order/note:string"],
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

        await addFields(ctx, {
          syncJson,
          filesync,
          modelApiIdentifier: parsed.modelApiIdentifier,
          fields: [{ name: parsed.fieldName, fieldType: parsed.fieldType }],
        });

        println({ ensureEmptyLineAbove: true, content: `Field ${colors.code(parsed.fieldName)} added successfully.` });
      },
    }),
  }),
});
