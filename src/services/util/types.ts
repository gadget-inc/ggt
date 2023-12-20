import type { Simplify } from "type-fest";

export type PartialExcept<T, K extends keyof T> = Simplify<Partial<T> & Pick<T, K>>;
