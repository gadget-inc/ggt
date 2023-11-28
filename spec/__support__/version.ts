import { afterEach, beforeEach, vi, type SpyInstance } from "vitest";
import { config } from "../../src/services/config/config.js";

/**
 * Mocks config.version and config.versionFull so that it doesn't change
 * between releases, node versions, ci architectures, etc.
 */
export const mockVersion = (): void => {
  let versionSpy: SpyInstance;
  let versionFullSpy: SpyInstance;

  beforeEach(() => {
    versionSpy = vi.spyOn(config, "version", "get").mockReturnValue("1.2.3");
    versionFullSpy = vi.spyOn(config, "versionFull", "get").mockReturnValue("ggt/1.2.3 darwin-arm64 node-v16.0.0");
  });

  afterEach(() => {
    versionSpy.mockRestore();
    versionFullSpy.mockRestore();
  });
};
