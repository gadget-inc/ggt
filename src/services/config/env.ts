import process from "node:process";

/**
 * Captures the current environment ggt is running in.
 */
export const env = {
  get value(): string {
    return process.env["GGT_ENV"] || "production";
  },

  get productionLike(): boolean {
    return !this.developmentOrTestLike;
  },

  get developmentLike(): boolean {
    return this.value.startsWith("development");
  },

  get testLike(): boolean {
    return this.value.startsWith("test");
  },

  get developmentOrTestLike(): boolean {
    return this.developmentLike || this.testLike;
  },
};
