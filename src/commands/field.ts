import fs from "fs-extra";

import { addFields, parseFieldTarget } from "../services/add/field.ts";
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

const modelPathToSchemaFile = (modelPath: string): string => `api/models/${modelPath}/schema.gadget.ts`;

const isIdentifier = (value: string): boolean => /^[$A-Z_a-z][$\w]*$/.test(value);

const skipTrivia = (input: string, start: number, end = input.length): number => {
  let i = start;

  while (i < end) {
    const char = input[i];
    const next = input[i + 1];

    if (char && /\s/.test(char)) {
      i += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      const lineEnd = input.indexOf("\n", i + 2);
      i = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }

    if (char === "/" && next === "*") {
      const blockEnd = input.indexOf("*/", i + 2);
      i = blockEnd === -1 ? end : blockEnd + 2;
      continue;
    }

    break;
  }

  return i;
};

const findMatchingBrace = (input: string, openBraceIndex: number, end = input.length): number => {
  if (input[openBraceIndex] !== "{") {
    return -1;
  }

  let depth = 0;
  let inString: "'" | '"' | "`" | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openBraceIndex; i < end; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === inString) {
        inString = null;
      }

      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      inString = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
};

type Segment = {
  start: number;
  end: number;
  text: string;
};

const splitTopLevelSegments = (input: string): Segment[] => {
  const segments: Segment[] = [];

  let segmentStart = 0;
  let curlyDepth = 0;
  let squareDepth = 0;
  let parenDepth = 0;

  let inString: "'" | '"' | "`" | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === inString) {
        inString = null;
      }

      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      inString = char;
      continue;
    }

    if (char === "{") {
      curlyDepth += 1;
      continue;
    }

    if (char === "}") {
      curlyDepth -= 1;
      continue;
    }

    if (char === "[") {
      squareDepth += 1;
      continue;
    }

    if (char === "]") {
      squareDepth -= 1;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      continue;
    }

    if (char === ")") {
      parenDepth -= 1;
      continue;
    }

    if (char === "," && curlyDepth === 0 && squareDepth === 0 && parenDepth === 0) {
      const text = input.slice(segmentStart, i);
      if (text.trim().length > 0) {
        segments.push({ start: segmentStart, end: i, text });
      }
      segmentStart = i + 1;
    }
  }

  const tail = input.slice(segmentStart);
  if (tail.trim().length > 0) {
    segments.push({ start: segmentStart, end: input.length, text: tail });
  }

  return segments;
};

type PropertyKey = {
  name: string;
  keyStart: number;
  keyEnd: number;
  colonIndex: number;
};

const parsePropertyKey = (segment: string): PropertyKey | undefined => {
  let i = skipTrivia(segment, 0, segment.length);

  if (i >= segment.length || segment.startsWith("...", i)) {
    return;
  }

  const keyStart = i;
  let keyEnd = i;
  let name = "";

  const quote = segment[i];
  if (quote === '"' || quote === "'") {
    i += 1;
    let escaped = false;

    while (i < segment.length) {
      const char = segment[i];
      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        i += 1;
        continue;
      }

      if (char === quote) {
        break;
      }

      i += 1;
    }

    if (i >= segment.length || segment[i] !== quote) {
      return;
    }

    keyEnd = i + 1;
    name = segment.slice(keyStart + 1, i).replace(/\\([\\"'])/g, "$1");
    i += 1;
  } else {
    const identifierMatch = /^[A-Za-z_$][\w$]*/.exec(segment.slice(i));
    if (!identifierMatch) {
      return;
    }

    name = identifierMatch[0];
    i += identifierMatch[0].length;
    keyEnd = i;
  }

  i = skipTrivia(segment, i, segment.length);
  if (segment[i] !== ":") {
    return;
  }

  return { name, keyStart, keyEnd, colonIndex: i };
};

const findModelFieldsObjectRange = (source: string): { start: number; end: number } | { error: string } => {
  const exportDefaultMatch = /export\s+default\b/.exec(source);
  if (!exportDefaultMatch) {
    return { error: "Schema file does not contain `export default { ... }`." };
  }

  const modelObjectStart = skipTrivia(source, exportDefaultMatch.index + exportDefaultMatch[0].length);
  if (source[modelObjectStart] !== "{") {
    return { error: "Schema file uses an unsupported export format." };
  }

  const modelObjectEnd = findMatchingBrace(source, modelObjectStart);
  if (modelObjectEnd === -1) {
    return { error: "Schema file has an unbalanced object literal." };
  }

  const modelInnerStart = modelObjectStart + 1;
  const modelInnerEnd = modelObjectEnd;
  const modelSegments = splitTopLevelSegments(source.slice(modelInnerStart, modelInnerEnd));

  for (const segment of modelSegments) {
    const key = parsePropertyKey(segment.text);
    if (key?.name !== "fields") {
      continue;
    }

    const valueStartInSegment = skipTrivia(segment.text, key.colonIndex + 1, segment.text.length);
    if (segment.text[valueStartInSegment] !== "{") {
      return { error: "Schema `fields` property is not an object literal." };
    }

    const fieldsStart = modelInnerStart + segment.start + valueStartInSegment;
    const fieldsEnd = findMatchingBrace(source, fieldsStart, modelObjectEnd + 1);

    if (fieldsEnd === -1 || fieldsEnd > modelObjectEnd) {
      return { error: "Schema `fields` object is malformed." };
    }

    return { start: fieldsStart, end: fieldsEnd };
  }

  return { error: "Schema file does not define a top-level `fields` object." };
};

type SchemaEditResult = { source: string } | { error: string };

const removeFieldFromSchema = (source: string, fieldName: string): SchemaEditResult => {
  const fieldsRange = findModelFieldsObjectRange(source);
  if ("error" in fieldsRange) {
    return fieldsRange;
  }

  const inner = source.slice(fieldsRange.start + 1, fieldsRange.end);
  const segments = splitTopLevelSegments(inner);
  const targetIndex = segments.findIndex((segment) => parsePropertyKey(segment.text)?.name === fieldName);

  if (targetIndex === -1) {
    return { error: `Field ${fieldName} does not exist in schema.` };
  }

  const updatedInner = segments
    .filter((_, index) => index !== targetIndex)
    .map((segment) => segment.text)
    .join(",");

  return {
    source: `${source.slice(0, fieldsRange.start + 1)}${updatedInner}${source.slice(fieldsRange.end)}`,
  };
};

const renameFieldInSchema = (source: string, fieldName: string, newFieldName: string): SchemaEditResult => {
  const fieldsRange = findModelFieldsObjectRange(source);
  if ("error" in fieldsRange) {
    return fieldsRange;
  }

  const inner = source.slice(fieldsRange.start + 1, fieldsRange.end);
  const segments = splitTopLevelSegments(inner);

  const sourceIndex = segments.findIndex((segment) => parsePropertyKey(segment.text)?.name === fieldName);
  if (sourceIndex === -1) {
    return { error: `Field ${fieldName} does not exist in schema.` };
  }

  if (segments.some((segment) => parsePropertyKey(segment.text)?.name === newFieldName)) {
    return { error: `Field ${newFieldName} already exists in schema.` };
  }

  const sourceSegment = segments[sourceIndex];
  const key = parsePropertyKey(sourceSegment.text);
  if (!key) {
    return { error: `Unable to parse field ${fieldName}.` };
  }

  const nextKey = isIdentifier(newFieldName) ? newFieldName : `"${newFieldName.replaceAll('"', '\\"')}"`;

  const updatedSourceSegment = `${sourceSegment.text.slice(0, key.keyStart)}${nextKey}${sourceSegment.text.slice(key.keyEnd)}`;

  const updatedInner = segments
    .map((segment, index) => {
      if (index === sourceIndex) {
        return updatedSourceSegment;
      }
      return segment.text;
    })
    .join(",");

  return {
    source: `${source.slice(0, fieldsRange.start + 1)}${updatedInner}${source.slice(fieldsRange.end)}`,
  };
};

const parseModelFieldPath = (input: string): { modelApiIdentifier: string; fieldName: string; problems: string[] } => {
  const lastSlashIndex = input.lastIndexOf("/");
  const problems: string[] = [];

  if (lastSlashIndex === -1 || lastSlashIndex === input.length - 1) {
    return { modelApiIdentifier: "", fieldName: "", problems: ["Missing field definition"] };
  }

  const modelApiIdentifier = input.slice(0, lastSlashIndex);
  const fieldName = input.slice(lastSlashIndex + 1);

  if (!modelApiIdentifier) {
    problems.push("Missing model definition");
  }

  if (!fieldName) {
    problems.push("Missing field definition");
  }

  return {
    modelApiIdentifier,
    fieldName,
    problems,
  };
};

const throwFieldProblems = (action: string, problems: string[]): never => {
  throw new FlagError(
    sprint`
      Failed to ${action} field:

        ${problems.map((problem) => `• ${problem}`).join("\n")}
    `,
    { usageHint: false },
  );
};

export default defineCommand({
  name: "field",
  description: "Add and manage fields on your models",
  details: sprint`
    Field commands sync local files with the environment before making schema
    changes. ${colors.subdued("ggt field add")} mirrors ${colors.subdued("ggt add field")} behavior,
    while ${colors.subdued("remove")} and ${colors.subdued("rename")} edit your local model schema and
    push the update.
  `,
  examples: [
    "ggt field add post/title:string",
    "ggt field add mystore/order/note:string",
    "ggt field remove post/title --force",
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
          description: "Model and field path",
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
        const parsed = parseModelFieldPath(input);

        if (parsed.problems.length > 0) {
          throwFieldProblems("remove", parsed.problems);
        }

        const schemaFile = modelPathToSchemaFile(parsed.modelApiIdentifier);
        const schemaPath = syncJson.directory.absolute(schemaFile);

        if (!(await fs.pathExists(schemaPath))) {
          throw new FlagError(`${parsed.modelApiIdentifier} does not exist.`, { usageHint: false });
        }

        const schema = await fs.readFile(schemaPath, "utf8");
        const result = removeFieldFromSchema(schema, parsed.fieldName);

        let nextSchema = schema;
        if ("source" in result) {
          nextSchema = result.source;
        } else {
          throwFieldProblems("remove", [result.error]);
        }

        if (!flags["--force"]) {
          await confirm(`Delete field ${input} and all of its data?`);
        }

        await fs.writeFile(schemaPath, nextSchema);

        const hashes = await filesync.hashes(ctx, { silent: true });
        await filesync.push(ctx, { command: "field", hashes });

        println({
          ensureEmptyLineAbove: true,
          content: `${colors.created(symbol.tick)} Removed ${colors.code(parsed.fieldName)} from ${colors.code(parsed.modelApiIdentifier)}.`,
        });
      },
    }),
    rename: sub({
      description: "Rename a field",
      examples: ["ggt field rename post/title post/heading", "ggt field rename mystore/order/note mystore/order/internalNote"],
      positionals: [
        {
          name: "model/field",
          required: true,
          description: "Current model and field path",
        },
        {
          name: "new-name",
          required: true,
          description: "New model and field path",
        },
      ],
      run: async (ctx, flags) => {
        const { filesync, syncJson } = await setupCommandSync(ctx, "field", flags);

        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const source = flags._[0]!;
        // oxlint-disable-next-line no-non-null-assertion -- framework validates required positional
        const target = flags._[1]!;

        const current = parseModelFieldPath(source);
        const next = parseModelFieldPath(target);

        const problems = [
          ...current.problems.map((problem) => `current path: ${problem}`),
          ...next.problems.map((problem) => `new path: ${problem}`),
        ];
        if (problems.length > 0) {
          throwFieldProblems("rename", problems);
        }

        if (current.modelApiIdentifier !== next.modelApiIdentifier) {
          throw new FlagError("Renaming fields across models is not supported.", { usageHint: false });
        }

        if (current.fieldName === next.fieldName) {
          throw new FlagError("New field name must be different from the existing field name.", { usageHint: false });
        }

        const schemaFile = modelPathToSchemaFile(current.modelApiIdentifier);
        const schemaPath = syncJson.directory.absolute(schemaFile);

        if (!(await fs.pathExists(schemaPath))) {
          throw new FlagError(`${current.modelApiIdentifier} does not exist.`, { usageHint: false });
        }

        const schema = await fs.readFile(schemaPath, "utf8");
        const result = renameFieldInSchema(schema, current.fieldName, next.fieldName);

        let nextSchema = schema;
        if ("source" in result) {
          nextSchema = result.source;
        } else {
          throwFieldProblems("rename", [result.error]);
        }

        await fs.writeFile(schemaPath, nextSchema);

        const hashes = await filesync.hashes(ctx, { silent: true });
        await filesync.push(ctx, { command: "field", hashes });

        println({
          ensureEmptyLineAbove: true,
          content: `${colors.created(symbol.tick)} Renamed ${colors.code(current.fieldName)} to ${colors.code(next.fieldName)} on ${colors.code(current.modelApiIdentifier)}.`,
        });
      },
    }),
  }),
});
