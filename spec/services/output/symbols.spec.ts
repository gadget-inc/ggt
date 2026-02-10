import { describe, expect, it } from "vitest";

import { symbol } from "../../../src/services/output/symbols.js";

describe("symbol", () => {
  it("has a tick symbol", () => {
    expect(typeof symbol.tick).toBe("string");
    expect(symbol.tick.length).toBeGreaterThan(0);
  });

  it("has a cross symbol", () => {
    expect(typeof symbol.cross).toBe("string");
    expect(symbol.cross.length).toBeGreaterThan(0);
  });

  it("has an arrowRight symbol", () => {
    expect(typeof symbol.arrowRight).toBe("string");
    expect(symbol.arrowRight.length).toBeGreaterThan(0);
  });

  it("has an arrowDown symbol", () => {
    expect(typeof symbol.arrowDown).toBe("string");
    expect(symbol.arrowDown.length).toBeGreaterThan(0);
  });

  it("has an arrowUp symbol", () => {
    expect(typeof symbol.arrowUp).toBe("string");
    expect(symbol.arrowUp.length).toBeGreaterThan(0);
  });
});
