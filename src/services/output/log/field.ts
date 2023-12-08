import { type JsonObject, type JsonPrimitive } from "type-fest";

export type Fields = Record<string, Field> | { error: unknown } | { reason: unknown };

export type Field = FieldPrimitive | FieldObject | FieldArray;

export type FieldPrimitive = JsonPrimitive | bigint | undefined;

export type FieldObject = JsonObject | { [key in string]: Field } | Map<FieldPrimitive, Field>;

export type FieldArray = Field[] | Set<Field>;
