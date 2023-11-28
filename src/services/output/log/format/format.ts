import type { Fields } from "../field.js";
import type { Level } from "../level.js";
import { formatJson } from "./json.js";
import { formatPretty } from "./pretty.js";

export type Formatter = (level: Level, name: string, msg: string, fields: Fields) => string;

export const formatters = {
  pretty: formatPretty,
  json: formatJson,
} as const;
