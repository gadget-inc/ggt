import { afterEach, beforeEach, type MockInstance } from "vitest";
import { config } from "../../src/services/config/config.js";
import { packageJson } from "../../src/services/config/package-json.js";
import { mock } from "./mock.js";
import { testDirPath } from "./paths.js";

export const mockPackageJson = (): void => {
  let actualVersion: string;

  beforeEach(() => {
    actualVersion = packageJson.version;
    packageJson.version = "1.2.3";
  });

  afterEach(() => {
    packageJson.version = actualVersion;
  });
};

export const mockConfig = (): void => {
  let configDirSpy: MockInstance;
  let cacheDirSpy: MockInstance;
  let dataDirSpy: MockInstance;

  beforeEach(() => {
    // mock config.version and config.versionFull so that it doesn't
    // change between releases, node versions, ci architectures, etc.
    mock(config, "versionFull", "get", () => `${packageJson.name}/${packageJson.version} darwin-arm64 node-v18.0.0`);

    // store config files in the current test's tmp directory
    configDirSpy = mock(config, "configDir", "get", () => testDirPath("config"));
    cacheDirSpy = mock(config, "cacheDir", "get", () => testDirPath("cache"));
    dataDirSpy = mock(config, "dataDir", "get", () => testDirPath("data"));
  });

  unmockConfig = () => {
    configDirSpy.mockRestore();
    cacheDirSpy.mockRestore();
    dataDirSpy.mockRestore();
  };
};

export let unmockConfig: () => void;
