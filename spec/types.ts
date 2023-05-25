import type { MockInstance } from "vitest";

declare global {
  // assume every function has been vi.spyOn'd
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Function extends MockInstance<any[], any> {}
}

export {};
