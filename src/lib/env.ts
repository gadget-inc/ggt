import type { Paths } from "env-paths";
import envPaths from "env-paths";

/**
 * Captures the name and nature of the environment
 */
export class Env {
  static get value(): string {
    return process.env["GGT_ENV"] || "production";
  }

  static get paths(): Paths {
    return envPaths("gadget", { suffix: this.productionLike ? "" : this.value });
  }

  static get developmentLike(): boolean {
    return this.value.startsWith("development");
  }

  static get testLike(): boolean {
    return this.value.startsWith("test");
  }

  static get developmentOrTestLike(): boolean {
    return this.developmentLike || this.testLike;
  }

  static get productionLike(): boolean {
    return this.value.startsWith("production");
  }
}
