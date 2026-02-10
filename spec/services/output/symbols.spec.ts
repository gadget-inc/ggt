import { describe, expect, it } from "vitest";

import { symbol } from "../../../src/services/output/symbols.js";

describe("symbol", () => {
  it("has a tick symbol", () => {
    expect(symbol.tick).toMatchInlineSnapshot(`"✔"`);
  });

  it("has a cross symbol", () => {
    expect(symbol.cross).toMatchInlineSnapshot(`"✘"`);
  });

  it("has an arrowRight symbol", () => {
    expect(symbol.arrowRight).toMatchInlineSnapshot(`"→"`);
  });

  it("has an arrowDown symbol", () => {
    expect(symbol.arrowDown).toMatchInlineSnapshot(`"↓"`);
  });

  it("has an arrowUp symbol", () => {
    expect(symbol.arrowUp).toMatchInlineSnapshot(`"↑"`);
  });
});
