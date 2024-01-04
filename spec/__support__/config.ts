import { beforeEach } from "vitest";
import { config } from "../../src/services/config/config.js";
import { mock } from "./mock.js";
import { testDirPath } from "./paths.js";

export const mockConfig = (): void => {
  beforeEach(() => {
    // mock config.version and config.versionFull so that it doesn't
    // change between releases, node versions, ci architectures, etc.
    mock(config, "version", "get", () => "1.2.3");
    mock(config, "versionFull", "get", () => "ggt/1.2.3 darwin-arm64 node-v16.0.0");

    // store config files in the current test's tmp directory
    mock(config, "configDir", "get", () => testDirPath("config"));
    mock(config, "cacheDir", "get", () => testDirPath("cache"));
    mock(config, "dataDir", "get", () => testDirPath("data"));
  });
};
