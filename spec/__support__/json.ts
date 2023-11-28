import type { Jsonifiable } from "type-fest";

export const prettyJSON = (json: Jsonifiable): string => {
  return JSON.stringify(json, undefined, 2) + "\n";
};
