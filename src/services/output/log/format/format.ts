import type { Environment } from "../../../app/app.ts";
import type { Fields } from "../field.ts";
import type { Level } from "../level.ts";
import { formatJson } from "./json.ts";
import { formatPretty } from "./pretty.ts";

export type Formatter = (level: Level, name: string, msg: string, fields: Fields, timestamp?: Date, environment?: Environment) => string;

export const formatters = {
  pretty: formatPretty,
  json: formatJson,
} as const;
