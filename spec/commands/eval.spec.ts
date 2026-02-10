import fs from "fs-extra";
import nock from "nock";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as eval_ from "../../src/commands/eval.js";
import * as root from "../../src/commands/root.js";
import { UNPAUSE_ENVIRONMENT_MUTATION } from "../../src/services/app/edit/operation.js";
import { ArgError } from "../../src/services/command/arg.js";
import { config } from "../../src/services/config/config.js";
import { writeSession } from "../../src/services/user/session.js";
import { testApp, nockTestApps } from "../__support__/app.js";
import { makeArgs, makeRootArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { nockEditResponse } from "../__support__/graphql.js";
import { expectStdout } from "../__support__/output.js";
import { testDirPath } from "../__support__/paths.js";
import { expectProcessExit } from "../__support__/process.js";
import { loginTestUser, loginTestUserWithCookie, loginTestUserWithToken, matchAuthHeader } from "../__support__/user.js";

const fixtureClientBundlePath = path.resolve("spec/__fixtures__/gadget-client-bundle.cjs");

const mockClientSource = `
  class Client {
    constructor(options) {
      this._options = options;
    }
  }
  Client.prototype.user = {
    findMany: async () => [{ id: "1", name: "Alice" }, { id: "2", name: "Bob" }],
    findFirst: async () => ({ id: "1", name: "Alice" }),
  };
  module.exports = { Client };
`;

// Mock client that exposes processFetch headers for inspection
const mockHeaderInspectorSource = `
  class Client {
    constructor(options) {
      this._options = options;
      this.test = {
        async run() {
          const init = { headers: {} };
          await options.authenticationMode.custom.processFetch("http://test", init);
          return init.headers;
        }
      };
    }
  }
  module.exports = { Client };
`;

const nockUnpause = ({ envName = "development" } = {}): void => {
  const env = testApp.environments.find((e) => e.name === envName)!;
  nockEditResponse({
    operation: UNPAUSE_ENVIRONMENT_MUTATION,
    response: { data: { unpauseEnvironment: { success: true, alreadyActive: true } } },
    environment: { ...env, application: testApp },
    persist: true,
  });
};

const nockClientSource = ({ appSlug = "test", envName = "development", source = mockClientSource } = {}): void => {
  matchAuthHeader(
    nock(`https://${appSlug}--${envName}.${config.domains.app}`)
      .get("/api/client/node.js")
      .reply(200, source, { "content-type": "application/javascript" }),
  );
};

describe("eval", () => {
  let originalCwd: typeof process.cwd;
  let syncJsonDir: string;
  let syncJsonPath: string;
  let syncJsonContent: Record<string, unknown>;

  beforeEach(async () => {
    loginTestUser();
    nockTestApps();
    process.exitCode = undefined;
    delete process.env["GGT_LOG_FORMAT"];

    // Set up a sync.json directory so app/env resolution finds a valid state
    syncJsonDir = testDirPath("eval-cwd");
    syncJsonPath = path.join(syncJsonDir, ".gadget", "sync.json");
    syncJsonContent = {
      application: "test",
      environment: "development",
      environments: { development: { filesVersion: "1" } },
    };
    await fs.outputJSON(syncJsonPath, syncJsonContent);

    originalCwd = process.cwd;
    process.cwd = () => syncJsonDir;
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  describe("argument parsing", () => {
    it("errors when no snippet is provided", async () => {
      await expect(eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test"))).rejects.toThrow(ArgError);
    });

    it("exits with code 1 when no snippet is provided", async () => {
      await expectProcessExit(() => root.run(testCtx, makeRootArgs("eval", "--app", "test")), 1);
      expectStdout().toContain("Missing required snippet argument");
    });
  });

  describe("with mock client", () => {
    it("evaluates an expression and prints the result", async () => {
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toContain("Alice");
      expectStdout().toContain("Bob");
    });

    it("evaluates a statement with implicit return", async () => {
      nockClientSource();

      await eval_.run(
        testCtx,
        makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "const result = await api.user.findFirst(); return result"),
      );

      expectStdout().toContain("Alice");
    });

    it("prints nothing when result is undefined", async () => {
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "void 0"));

      expectStdout().toEqual("");
    });

    it("has access to process.env", async () => {
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "process.env.GGT_ENV"));

      expectStdout().toContain("test");
    });

    it("allows require", async () => {
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "require('node:os').EOL"));

      expectStdout().toContain("\n");
    });

    it("outputs JSON when --json is passed", async () => {
      process.env["GGT_LOG_FORMAT"] = "json";
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toMatchInlineSnapshot(`"[{"id":"1","name":"Alice"},{"id":"2","name":"Bob"}]
"`);
    });

    it("outputs nothing when result is undefined and --json is passed", async () => {
      process.env["GGT_LOG_FORMAT"] = "json";
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "void 0"));

      expectStdout().toEqual("");
    });

    it("outputs JSON error object when snippet throws and --json is passed", async () => {
      process.env["GGT_LOG_FORMAT"] = "json";
      const clientSource = `
        class Client {
          constructor(options) {
            this._options = options;
            this.user = {
              findMany: async () => { throw new Error("connection refused"); }
            };
          }
        }
        module.exports = { Client };
      `;
      nockClientSource({ source: clientSource });

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toMatchInlineSnapshot(`"{"error":"connection refused"}
"`);
      expect(process.exitCode).toBe(1);
    });

    it("formats objects with util.inspect", async () => {
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findFirst()"));

      expectStdout().toContain("id:");
      expectStdout().toContain("name:");
    });

    it("sets readonly header by default", async () => {
      nockClientSource({ source: mockHeaderInspectorSource });

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.test.run()"));

      expectStdout().toContain("x-gadget-developer-readonly");
      expectStdout().toContain("true");
    });

    it("omits readonly header with --allow-writes", async () => {
      nockClientSource({ source: mockHeaderInspectorSource });

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "-w", "api.test.run()"));

      expectStdout().not.toContain("x-gadget-developer-readonly");
    });

    it("sets the environment header", async () => {
      nockClientSource({ source: mockHeaderInspectorSource });

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.test.run()"));

      expectStdout().toContain("x-gadget-environment");
      expectStdout().toContain("development");
    });

    it("sets the x-gadget-client header for developer auth", async () => {
      nockClientSource({ source: mockHeaderInspectorSource });

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.test.run()"));

      expectStdout().toContain("x-gadget-client");
      expectStdout().toContain("graphql-playground");
    });

    it("sets auth cookie header when using cookie auth", async () => {
      // Re-login specifically with cookie auth for this test
      nock.cleanAll();
      loginTestUserWithCookie();
      nockTestApps();
      nockClientSource({ source: mockHeaderInspectorSource });

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.test.run()"));

      expectStdout().toContain("cookie");
    });

    it("sets token auth header when using token auth", async () => {
      // Re-login specifically with token auth for this test
      nock.cleanAll();
      writeSession(testCtx, undefined); // clear any session so token auth is used
      loginTestUserWithToken({ optional: false });
      nockTestApps();
      nockClientSource({ source: mockHeaderInspectorSource });

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.test.run()"));

      expectStdout().toContain("x-platform-access-token");
    });

    it("handles syntax error in snippet", async () => {
      nockClientSource();

      await expect(
        eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "const x = {")),
      ).rejects.toThrow(ArgError);
    });

    it("exits with code 1 on syntax error in snippet", async () => {
      nockClientSource();

      await expectProcessExit(() => root.run(testCtx, makeRootArgs("eval", "--app", "test", "--env", "development", "const x = {")), 1);
      expectStdout().toContain("Syntax error in snippet");
    });

    it("handles runtime error in snippet", async () => {
      const clientSource = `
        class Client {
          constructor(options) {
            this._options = options;
            this.user = {
              findMany: async () => { throw new Error("connection refused"); }
            };
          }
        }
        module.exports = { Client };
      `;
      nockClientSource({ source: clientSource });

      await expect(
        eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()")),
      ).rejects.toThrow("connection refused");
    });

    it("exits with code 1 on runtime error in snippet", async () => {
      const clientSource = `
        class Client {
          constructor(options) {
            this._options = options;
            this.user = {
              findMany: async () => { throw new Error("connection refused"); }
            };
          }
        }
        module.exports = { Client };
      `;
      nockClientSource({ source: clientSource });

      await expectProcessExit(
        () => root.run(testCtx, makeRootArgs("eval", "--app", "test", "--env", "development", "api.user.findMany()")),
        1,
      );
      expectStdout().toContain("Error executing snippet");
      expectStdout().toContain("connection refused");
    });

    it("resolves app from --app flag", async () => {
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toContain("Alice");
    });

    it("resolves env from --env flag", async () => {
      nockClientSource({ envName: "cool-environment-development" });

      await eval_.run(
        testCtx,
        makeArgs(eval_.args, "eval", "--app", "test", "--env", "cool-environment-development", "api.user.findMany()"),
      );

      expectStdout().toContain("Alice");
    });

    it("resolves app and env from .gadget/sync.json", async () => {
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "api.user.findMany()"));

      expectStdout().toContain("Alice");
    });
  });

  describe("filesystem side effects", () => {
    it("works from a directory without sync.json when --app and --env are provided", async () => {
      const emptyDir = testDirPath("no-sync-json");
      await fs.ensureDir(emptyDir);
      process.cwd = () => emptyDir;
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toContain("Alice");
    });
  });

  describe("client bundle caching", () => {
    it("writes cache file after fetching from server when filesVersion is available", async () => {
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toContain("Alice");
      const cachePath = path.join(config.cacheDir, "client-bundles", "test--development--1.js");
      await expect(fs.pathExists(cachePath)).resolves.toBe(true);
      const cached = await fs.readFile(cachePath, "utf8");
      expect(cached).toContain("Client");
    });

    it("uses cached bundle and skips HTTP request on cache hit", async () => {
      // Pre-populate the cache
      const cachePath = path.join(config.cacheDir, "client-bundles", "test--development--1.js");
      await fs.outputFile(cachePath, mockClientSource);

      // Do NOT set up a client source HTTP mock — cache should be used
      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toContain("Alice");
    });

    it("does not cache when no filesVersion is available (no sync.json)", async () => {
      const emptyDir = testDirPath("no-sync-json-cache");
      await fs.ensureDir(emptyDir);
      process.cwd = () => emptyDir;
      nockClientSource();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toContain("Alice");
      const cacheDir = path.join(config.cacheDir, "client-bundles");
      await expect(fs.pathExists(cacheDir)).resolves.toBe(false);
    });
  });

  describe("lazy unpause", () => {
    it("unpauses and retries when snippet throws GGT_ENVIRONMENT_PAUSED", async () => {
      const pausingClientSource = `
        class Client {
          constructor(options) {
            this._options = options;
          }
        }
        let _callCount = 0;
        Client.prototype.user = {
          findMany: async () => {
            _callCount++;
            if (_callCount === 1) throw new Error("GGT_ENVIRONMENT_PAUSED");
            return [{ id: "1", name: "Alice" }];
          },
        };
        module.exports = { Client };
      `;
      nockClientSource({ source: pausingClientSource });
      nockUnpause();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toContain("Alice");
    });

    it("formats retry failure as ArgError", async () => {
      const alwaysPausingSource = `
        class Client {
          constructor(options) { this._options = options; }
        }
        Client.prototype.user = {
          findMany: async () => { throw new Error("GGT_ENVIRONMENT_PAUSED"); },
        };
        module.exports = { Client };
      `;
      nockClientSource({ source: alwaysPausingSource });
      nockUnpause();

      await expect(
        eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()")),
      ).rejects.toThrow(ArgError);
    });

    it("formats retry failure as JSON in json mode", async () => {
      process.env["GGT_LOG_FORMAT"] = "json";
      const alwaysPausingSource = `
        class Client {
          constructor(options) { this._options = options; }
        }
        Client.prototype.user = {
          findMany: async () => { throw new Error("GGT_ENVIRONMENT_PAUSED"); },
        };
        module.exports = { Client };
      `;
      nockClientSource({ source: alwaysPausingSource });
      nockUnpause();

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toMatchInlineSnapshot(`"{"error":"GGT_ENVIRONMENT_PAUSED"}
"`);
      expect(process.exitCode).toBe(1);
    });

    it("propagates non-pause errors without calling unpause", async () => {
      const failingClientSource = `
        class Client {
          constructor(options) {
            this._options = options;
            this.user = {
              findMany: async () => { throw new Error("some other error"); }
            };
          }
        }
        module.exports = { Client };
      `;
      nockClientSource({ source: failingClientSource });
      // Do NOT nock unpause — if unpause is called, nock will fail with unmatched request

      await expect(
        eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()")),
      ).rejects.toThrow("some other error");
    });
  });

  describe("with real client bundle fixture", () => {
    it("loads the fixture bundle and runs an expression", async () => {
      const fixtureSource = await fs.readFile(fixtureClientBundlePath, "utf-8");
      nockClientSource({ source: fixtureSource });

      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findMany()"));

      expectStdout().toContain("Alice");
      expectStdout().toContain("Bob");
    });

    it("loads the fixture bundle and constructs client with auth options", async () => {
      const fixtureSource = await fs.readFile(fixtureClientBundlePath, "utf-8");
      nockClientSource({ source: fixtureSource });

      // The fact that this doesn't error means the Client constructor accepted our options
      await eval_.run(testCtx, makeArgs(eval_.args, "eval", "--app", "test", "--env", "development", "api.user.findFirst()"));

      expectStdout().toContain("Alice");
    });
  });
});
