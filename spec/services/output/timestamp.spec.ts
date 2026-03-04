import { describe, expect, it, vi } from "vitest";

import { ts } from "../../../src/services/output/timestamp.js";

describe("ts", () => {
  it("returns a formatted time string", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 15, 14, 30, 45));
      expect(ts()).toMatchInlineSnapshot(`"02:30:45 PM"`);
    } finally {
      vi.useRealTimers();
    }
  });
});
