import fs from "fs-extra";
import nock from "nock";
import path from "node:path";
import { waitUntilUsed } from "tcp-port-used";
import { beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import * as debuggerCommand from "../../src/commands/debugger.js";
import { config } from "../../src/services/config/config.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { makeSyncScenario, type SyncScenario } from "../__support__/filesync.js";
import { expectStdout } from "../__support__/output.js";
import { loginTestUser } from "../__support__/user.js";

// Helper to get subdomain from sync scenario
const getSubdomain = (syncScenario: SyncScenario): string => {
  return syncScenario.syncJson.environment.type === "production"
    ? syncScenario.syncJson.environment.application.slug
    : `${syncScenario.syncJson.environment.application.slug}--${syncScenario.syncJson.environment.name}`;
};

// Helper to create a mock remote WebSocket server
const createMockRemoteWs = async (
  options: {
    onMessage?: (ws: WebSocket, data: any) => void;
    onConnection?: (ws: WebSocket) => void;
  } = {},
): Promise<{ wss: WebSocketServer; port: number; cleanup: () => void }> => {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once("listening", resolve));
  const port = (wss.address() as any).port;

  wss.on("connection", (ws) => {
    options.onConnection?.(ws);

    ws.on("message", (data) => {
      options.onMessage?.(ws, JSON.parse(String(data)));
    });
  });

  const cleanup = (): void => {
    wss.close();
  };

  return { wss, port, cleanup };
};

// Helper to set up mock remote connection
const setupMockRemote = (subdomain: string, wsUrl: string, sessionId = "test-session-id", times = 1): void => {
  nock(`https://${subdomain}.${config.domains.app}`).post("/edit/api/debugger/start-session").times(times).reply(200, { sessionId, wsUrl });
};

describe("debugger", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  describe("basic functionality", () => {
    it("establishes a unique session id and responds to /json/version and /json/list requests", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      let response = await fetch("http://127.0.0.1:9229/json/version");
      expect(response.status).toBe(200);

      let responseBody = (await response.json()) as any;
      expect(responseBody).toMatchInlineSnapshot(`
        {
          "Browser": "node.js/22.15.0",
          "Protocol-Version": "1.1",
        }
      `);

      response = await fetch("http://127.0.0.1:9229/json/list");
      expect(response.status).toBe(200);

      responseBody = await response.json();
      const sessionId = responseBody[0].id;
      expect(responseBody.length).toBe(1);
      expect(sessionId).toBeDefined();
      expect(responseBody[0].title).toBe("ggt debugger");
      expect(responseBody[0].type).toBe("node");
      expect(responseBody[0].description).toBe("authenticated CDP proxy to current sandbox process for test@development");
      expect(responseBody[0].faviconUrl).toBe("https://assets.gadget.dev/assets/environment/dev/favicon-32.png");
      expect(responseBody[0].webSocketDebuggerUrl).toBe(`ws://127.0.0.1:9229/${sessionId}`);

      testCtx.abort();

      await debuggerPromise;
    });

    it("can start on a custom port", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args, "debugger", "--port", "9230"));

      await waitUntilUsed(9230);

      let response = await fetch("http://127.0.0.1:9230/json/version");
      expect(response.status).toBe(200);
      let responseBody = (await response.json()) as any;
      expect(responseBody).toMatchInlineSnapshot(`
        {
          "Browser": "node.js/22.15.0",
          "Protocol-Version": "1.1",
        }
      `);

      response = await fetch("http://127.0.0.1:9230/json/list");
      expect(response.status).toBe(200);

      responseBody = await response.json();
      const sessionId = responseBody[0].id;
      expect(responseBody.length).toBe(1);
      expect(sessionId).toBeDefined();
      expect(responseBody[0].title).toBe("ggt debugger");
      expect(responseBody[0].type).toBe("node");
      expect(responseBody[0].description).toBe("authenticated CDP proxy to current sandbox process for test@development");
      expect(responseBody[0].faviconUrl).toBe("https://assets.gadget.dev/assets/environment/dev/favicon-32.png");
      expect(responseBody[0].webSocketDebuggerUrl).toBe(`ws://127.0.0.1:9230/${sessionId}`);

      testCtx.abort();

      await debuggerPromise;
    });

    it("returns 404 for unknown routes", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      const response = await fetch("http://127.0.0.1:9229/unknown");
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not Found");

      testCtx.abort();

      await debuggerPromise;
    });
  });

  describe("websocket connection", () => {
    it("can connect to the debugger ws server and send CDP commands", async () => {
      const syncScenario = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      let resolveConnect: () => void;
      const connected = new Promise<void>((resolve) => {
        resolveConnect = resolve;
      });

      const { port, cleanup } = await createMockRemoteWs({
        onConnection: () => resolveConnect(),
        onMessage: (ws, payload) => {
          if (payload.method === "Runtime.enable") {
            ws.send(JSON.stringify({ id: 1, result: {} }));
          } else if (payload.method === "Debugger.enable") {
            ws.send(JSON.stringify({ id: 2, result: {} }));
          }
        },
      });

      setupMockRemote(getSubdomain(syncScenario), `ws://localhost:${port}`);

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      const response = await fetch("http://127.0.0.1:9229/json/list");
      const result = (await response.json()) as any;
      const wsUrl = result[0].webSocketDebuggerUrl;

      const ws = new WebSocket(wsUrl);

      const messages: string[] = [];

      const done = new Promise<void>((resolve) => {
        ws.on("message", (data) => {
          messages.push(String(data));
          if (messages.length === 2) {
            resolve();
          }
        });
      });

      await connected;

      ws.send(JSON.stringify({ id: 1, method: "Runtime.enable", params: {} }));
      ws.send(JSON.stringify({ id: 2, method: "Debugger.enable", params: {} }));

      await done;

      expect(messages).toMatchInlineSnapshot(`
        [
          "{"id":1,"result":{}}",
          "{"id":2,"result":{}}",
        ]
      `);

      // Wait for WebSocket to close before cleanup (with timeout)
      const wsClosed = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000); // 5s timeout
        ws.on("close", () => {
          clearTimeout(timeout);
          resolve();
        });
        ws.on("error", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      ws.close();
      await wsClosed;

      testCtx.abort();
      await debuggerPromise;
      cleanup();
    });

    it("rejects websocket connections with wrong session id", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      const ws = new WebSocket("ws://127.0.0.1:9229/wrong-session-id");

      const errorPromise = new Promise((resolve) => {
        ws.on("error", resolve);
        ws.on("close", resolve);
      });

      await errorPromise;

      testCtx.abort();

      await debuggerPromise;
    });

    it("rejects concurrent websocket connections", { timeout: 15000 }, async () => {
      const syncScenario = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      let resolveConnect: () => void;
      const connected = new Promise<void>((resolve) => {
        resolveConnect = resolve;
      });

      const { port, cleanup } = await createMockRemoteWs({
        onConnection: () => resolveConnect(),
        onMessage: (ws, payload) => {
          if (payload.method === "Runtime.enable") {
            ws.send(JSON.stringify({ id: 1, result: {} }));
          }
        },
      });

      setupMockRemote(getSubdomain(syncScenario), `ws://localhost:${port}`);

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      const response = await fetch("http://127.0.0.1:9229/json/list");
      const result = (await response.json()) as any;
      const wsUrl = result[0].webSocketDebuggerUrl;

      // Establish first connection
      const ws1 = new WebSocket(wsUrl);
      await connected;

      // Try to establish second connection - should be rejected with 409
      const ws2 = new WebSocket(wsUrl);

      const ws2ErrorOrClose = new Promise<number>((resolve) => {
        ws2.on("close", (code) => resolve(code));
        ws2.on("error", () => {
          // Error occurred, wait for close
          ws2.on("close", (code) => resolve(code));
        });
      });

      const closeCode = await ws2ErrorOrClose;
      expect(closeCode).toBe(1006); // Connection closed abnormally

      // Wait for first connection to close before cleanup (with timeout)
      const ws1Closed = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000); // 5s timeout
        ws1.on("close", () => {
          clearTimeout(timeout);
          resolve();
        });
        ws1.on("error", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      ws1.close();
      await ws1Closed;

      testCtx.abort();
      await debuggerPromise;
      cleanup();
    });

    it("allows new connection after previous client disconnects", async () => {
      const syncScenario = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      let connectionCount = 0;
      let resolveFirstConnect: () => void;
      let resolveSecondConnect: () => void;
      const firstConnected = new Promise<void>((resolve) => {
        resolveFirstConnect = resolve;
      });
      const secondConnected = new Promise<void>((resolve) => {
        resolveSecondConnect = resolve;
      });

      const { port, cleanup } = await createMockRemoteWs({
        onConnection: () => {
          connectionCount++;
          if (connectionCount === 1) {
            resolveFirstConnect();
          } else if (connectionCount === 2) {
            resolveSecondConnect();
          }
        },
      });

      setupMockRemote(getSubdomain(syncScenario), `ws://localhost:${port}`, "test-session-id", 2);

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      const response = await fetch("http://127.0.0.1:9229/json/list");
      const result = (await response.json()) as any;
      const wsUrl = result[0].webSocketDebuggerUrl;

      // Establish first connection
      const ws1 = new WebSocket(wsUrl);
      await firstConnected;

      // Close first connection (with timeout)
      const ws1Closed = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000); // 5s timeout
        ws1.on("close", () => {
          clearTimeout(timeout);
          resolve();
        });
        ws1.on("error", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      ws1.close();
      await ws1Closed;

      // Establish second connection
      const ws2 = new WebSocket(wsUrl);
      await secondConnected;

      // Wait for second connection to close before cleanup (with timeout)
      const ws2Closed = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000); // 5s timeout
        ws2.on("close", () => {
          clearTimeout(timeout);
          resolve();
        });
        ws2.on("error", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      ws2.close();
      await ws2Closed;

      testCtx.abort();
      await debuggerPromise;
      cleanup();
    });

    it("closes client connection when remote connection closes", async () => {
      const syncScenario = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      let resolveConnect: () => void;
      const connected = new Promise<void>((resolve) => {
        resolveConnect = resolve;
      });

      let remoteWs: WebSocket;

      const { port, cleanup } = await createMockRemoteWs({
        onConnection: (ws) => {
          remoteWs = ws;
          resolveConnect();
        },
      });

      setupMockRemote(getSubdomain(syncScenario), `ws://localhost:${port}`);

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      const response = await fetch("http://127.0.0.1:9229/json/list");
      const result = (await response.json()) as any;
      const wsUrl = result[0].webSocketDebuggerUrl;

      const clientWs = new WebSocket(wsUrl);

      await connected;

      const clientClosed = new Promise<{ code: number; reason: string }>((resolve) => {
        clientWs.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
      });

      // Close remote connection
      remoteWs!.close();

      const { code, reason } = await clientClosed;
      expect(code).toBe(1011);
      expect(reason).toContain("Remote debugger connection closed by server");

      testCtx.abort();
      await debuggerPromise;
      cleanup();
    });

    it("closes client connection when start-session returns 409", async () => {
      const syncScenario = await makeSyncScenario({ localFiles: { ".gadget/": "" } });
      const subdomain = getSubdomain(syncScenario);

      // Mock start-session to return 409 Conflict
      nock(`https://${subdomain}.${config.domains.app}`)
        .post("/edit/api/debugger/start-session")
        .optionally()
        .reply(409, { error: "Another debugger session is already active" });

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      const response = await fetch("http://127.0.0.1:9229/json/list");
      const result = (await response.json()) as any;
      const wsUrl = result[0].webSocketDebuggerUrl;

      const clientWs = new WebSocket(wsUrl);

      const clientClosed = new Promise<{ code: number; reason: string }>((resolve) => {
        clientWs.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
        clientWs.on("error", () => {
          // If error occurs before close, wait for close event
          clientWs.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
        });
      });

      const { code, reason } = await clientClosed;
      expect(code).toBe(1011);
      expect(reason).toContain("Failed to establish remote debugger connection");

      testCtx.abort();
      await debuggerPromise;
    });

    it("preserves text/binary framing end-to-end", async () => {
      const syncScenario = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      // Remote mock WS server that records whether received frames are binary
      const wss = new WebSocketServer({ port: 0 });
      await new Promise<void>((resolve) => wss.once("listening", resolve));
      const remotePort = (wss.address() as any).port as number;

      const remoteReceivedIsBinary: boolean[] = [];
      let remoteSocket!: WebSocket;

      const remoteConnected = new Promise<void>((resolve) => {
        wss.on("connection", (ws) => {
          remoteSocket = ws;
          ws.on("message", (_data, isBinary) => {
            remoteReceivedIsBinary.push(isBinary);
          });
          resolve();
        });
      });

      setupMockRemote(getSubdomain(syncScenario), `ws://localhost:${remotePort}`);

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      const response = await fetch("http://127.0.0.1:9229/json/list");
      const result = (await response.json()) as any;
      const wsUrl = result[0].webSocketDebuggerUrl;

      const clientWs = new WebSocket(wsUrl);

      await remoteConnected; // ensure remote side is connected

      // Track framing for messages coming back from remote to client
      const clientReceivedIsBinary: boolean[] = [];
      const clientGotTwo = new Promise<void>((resolve) => {
        clientWs.on("message", (_data, isBinary) => {
          clientReceivedIsBinary.push(isBinary);
          if (clientReceivedIsBinary.length === 2) {
            resolve();
          }
        });
      });

      // Client -> Remote: send a text frame (string) and a binary frame (Buffer)
      clientWs.send(JSON.stringify({ hello: "world" }));
      clientWs.send(Buffer.from([1, 2, 3]), { binary: true });

      // Wait until remote has received both messages
      await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const check = (): void => {
          if (remoteReceivedIsBinary.length >= 2) {
            resolve();
            return;
          }
          if (Date.now() - start > 5000) {
            reject(new Error("timeout waiting for remote messages"));
            return;
          }
          setTimeout(check, 25);
        };
        check();
      });

      expect(remoteReceivedIsBinary).toEqual([false, true]);

      // Remote -> Client: send a text frame and a binary frame and ensure client sees same framing
      remoteSocket.send(JSON.stringify({ ok: true }), { binary: false });
      remoteSocket.send(Buffer.from([9, 8, 7]), { binary: true });

      await clientGotTwo;
      expect(clientReceivedIsBinary).toEqual([false, true]);

      // Cleanup
      await new Promise<void>((resolve) => {
        clientWs.once("close", () => resolve());
        clientWs.close();
      });
      wss.close();
      testCtx.abort();
      await debuggerPromise;
    });
  });

  describe("configuration", () => {
    it("configures VS Code debugger with default port", async () => {
      const { localDir } = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      await debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args, "debugger", localDir.path, "--configure", "vscode"));

      const launchJsonPath = path.join(localDir.path, ".vscode", "launch.json");
      const tasksJsonPath = path.join(localDir.path, ".vscode", "tasks.json");

      expect(await fs.pathExists(launchJsonPath)).toBe(true);
      expect(await fs.pathExists(tasksJsonPath)).toBe(true);

      const launchJson = await fs.readJson(launchJsonPath);
      expect(launchJson.version).toBe("0.2.0");
      expect(launchJson.configurations).toHaveLength(1);
      expect(launchJson.configurations[0]).toMatchObject({
        type: "node",
        request: "attach",
        name: "Gadget debugger",
        address: "127.0.0.1",
        port: 9229,
        localRoot: "${workspaceFolder}",
        remoteRoot: "/gadget/app",
        preLaunchTask: "ggt debugger",
        restart: true,
        timeout: 60000,
      });

      const tasksJson = await fs.readJson(tasksJsonPath);
      expect(tasksJson.version).toBe("2.0.0");
      expect(tasksJson.tasks).toHaveLength(1);
      expect(tasksJson.tasks[0]).toMatchObject({
        label: "ggt debugger",
        type: "shell",
        command: "ggt debugger",
        isBackground: true,
      });

      expectStdout().toContain("Configured vscode debugger");
    });

    it("configures Cursor debugger with default port", async () => {
      const { localDir } = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      await debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args, "debugger", localDir.path, "--configure", "cursor"));

      const launchJsonPath = path.join(localDir.path, ".vscode", "launch.json");
      const tasksJsonPath = path.join(localDir.path, ".vscode", "tasks.json");

      expect(await fs.pathExists(launchJsonPath)).toBe(true);
      expect(await fs.pathExists(tasksJsonPath)).toBe(true);

      expectStdout().toContain("Configured cursor debugger");
    });

    it("configures debugger with custom port", async () => {
      const { localDir } = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      await debuggerCommand.run(
        testCtx,
        makeArgs(debuggerCommand.args, "debugger", localDir.path, "--configure", "vscode", "--port", "9230"),
      );

      const launchJsonPath = path.join(localDir.path, ".vscode", "launch.json");
      const launchJson = await fs.readJson(launchJsonPath);

      expect(launchJson.configurations[0].port).toBe(9230);
    });

    it("updates existing VS Code configuration", async () => {
      const { localDir } = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const vscodeDir = path.join(localDir.path, ".vscode");
      await fs.ensureDir(vscodeDir);

      // Create existing launch.json with other configurations
      const existingLaunchJson = {
        version: "0.2.0",
        configurations: [
          {
            type: "node",
            request: "launch",
            name: "Other Config",
            program: "${workspaceFolder}/index.js",
          },
          {
            type: "node",
            request: "attach",
            name: "Gadget debugger",
            address: "127.0.0.1",
            port: 9229,
            localRoot: "${workspaceFolder}",
            remoteRoot: "/gadget/app",
            preLaunchTask: "ggt debugger",
            restart: true,
            timeout: 60000,
          },
        ],
      };
      await fs.writeJson(path.join(vscodeDir, "launch.json"), existingLaunchJson);

      await debuggerCommand.run(
        testCtx,
        makeArgs(debuggerCommand.args, "debugger", localDir.path, "--configure", "vscode", "--port", "9230"),
      );

      const launchJson = await fs.readJson(path.join(vscodeDir, "launch.json"));

      expect(launchJson.configurations).toHaveLength(2);
      expect(launchJson.configurations[0].name).toBe("Other Config");
      expect(launchJson.configurations[1].name).toBe("Gadget debugger");
      expect(launchJson.configurations[1].port).toBe(9230);
    });

    it("throws error for invalid editor name", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      await expect(debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args, "debugger", "--configure", "invalid"))).rejects.toThrow(
        'Invalid editor "invalid". Supported editors: vscode, cursor',
      );
    });

    it("warns when VS Code configuration does not exist", async () => {
      await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      expectStdout().toContain("Gadget debugger not configured");

      testCtx.abort();

      await debuggerPromise;
    });

    it("does not warn when VS Code configuration exists", async () => {
      const { localDir } = await makeSyncScenario({ localFiles: { ".gadget/": "" } });

      const vscodeDir = path.join(localDir.path, ".vscode");
      await fs.ensureDir(vscodeDir);
      await fs.writeJson(path.join(vscodeDir, "launch.json"), {
        version: "0.2.0",
        configurations: [
          {
            type: "node",
            request: "attach",
            name: "Gadget debugger",
            address: "127.0.0.1",
            port: 9229,
          },
        ],
      });

      const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

      await waitUntilUsed(9229);

      const stdout = expectStdout();
      expect(stdout).not.toContain("Gadget debugger not configured");

      testCtx.abort();

      await debuggerPromise;
    });
  });
});
