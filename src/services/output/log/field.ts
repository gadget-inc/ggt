import { type JsonPrimitive } from "type-fest";

type FieldPrimitive = JsonPrimitive | bigint | undefined;

type FieldObject = { [key in string]: Field } | Map<FieldPrimitive, Field>;

type FieldArray = Field[] | Set<Field>;

export type Field = FieldPrimitive | FieldObject | FieldArray;

export type Fields = Record<string, Field> | { error: unknown };
