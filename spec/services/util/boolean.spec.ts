import { describe, expect, it } from "vitest";

import { parseBoolean } from "../../../src/services/util/boolean.js";

describe("parseBoolean", () => {
  it.each(["1", "true", "True", "TRUE"])("parses %s as true", (value) => {
    expect(parseBoolean(value)).toBe(true);
  });

  it.each(["0", "false", "False", "FALSE"])("parses %s as false", (value) => {
    expect(parseBoolean(value)).toBe(false);
  });
});
