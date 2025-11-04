import { http } from "msw";
import { waitUntilUsed } from "tcp-port-used";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../../src/services/config/config.js";
import { mockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { mockServer } from "../__support__/msw.js";
import { loginTestUser } from "../__support__/user.js";

// Store reference to the real WebSocket for mocking
const RealWebSocket = WebSocket;
let mockRemoteWsUrl: string | undefined;
let mockRemoteWsRedirectUrl: string | undefined;

// Mock the ws module to intercept WebSocket connections
vi.mock("ws", async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import("ws")>("ws");
  return {
    ...actual,
    WebSocket: class MockedWebSocket extends actual.WebSocket {
      constructor(url: string, ...args: any[]) {
        // Redirect remote Gadget connections to our mock server
        if (mockRemoteWsUrl && url.includes(mockRemoteWsUrl)) {
          super(mockRemoteWsRedirectUrl!, ...args);
        } else {
          super(url, ...args);
        }
      }
    },
  };
});

import * as debuggerCommand from "../../src/commands/debugger.js";

describe("debugger", () => {
  beforeEach(() => {
    loginTestUser();
    mockTestApps();
  });

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

  it("can connect to the debugger ws server and send CDP commands", async () => {
    const syncScenario = await makeSyncScenario({ localFiles: { ".gadget/": "" } });
    const subdomain =
      syncScenario.syncJson.environment.type === "production"
        ? syncScenario.syncJson.environment.application.slug
        : `${syncScenario.syncJson.environment.application.slug}--${syncScenario.syncJson.environment.name}`;

    let resolveConnect: () => void;
    const connected = new Promise<void>((resolve) => {
      resolveConnect = resolve;
    });

    let sessionId = "test-session-id";

    // Create a real WebSocket server to act as the remote Gadget debugger
    const mockRemoteWss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => mockRemoteWss.once("listening", resolve));
    const mockRemotePort = (mockRemoteWss.address() as any).port;

    mockRemoteWss.on("connection", (ws) => {
      resolveConnect();

      ws.on("message", (data) => {
        // Echo messages back
        ws.send(data);
      });
    });

    // Set up URL redirection for the mocked WebSocket
    mockRemoteWsUrl = "/edit/api/debugger";
    mockRemoteWsRedirectUrl = `ws://localhost:${mockRemotePort}`;

    mockServer.use(
      http.post(`https://${subdomain}.${config.domains.app}/edit/api/debugger/start-session`, () => {
        return Response.json({ sessionId });
      }),
    );

    const debuggerPromise = debuggerCommand.run(testCtx, makeArgs(debuggerCommand.args));

    await waitUntilUsed(9229);

    const response = await fetch("http://127.0.0.1:9229/json/list");
    const result = (await response.json()) as any;
    sessionId = result[0].id;
    const wsUrl = result[0].webSocketDebuggerUrl;

    const _ws = new RealWebSocket(wsUrl);

    await connected;

    testCtx.abort();

    await debuggerPromise;

    // Clean up
    mockRemoteWsUrl = undefined;
    mockRemoteWsRedirectUrl = undefined;
    mockRemoteWss.close();
  });
});
