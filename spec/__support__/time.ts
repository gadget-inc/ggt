import { afterEach, beforeEach, vi } from "vitest";

export const mockSystemTime = (): void => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
};
