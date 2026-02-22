import type { Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

import chalk from "chalk";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process, { nextTick } from "node:process";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import type { ArgsDefinition } from "../services/command/arg.js";
import type { Run } from "../services/command/command.js";
import type { Context } from "../services/command/context.js";

import { AppIdentity, AppIdentityArgs } from "../services/command/app-identity.js";
import { config } from "../services/config/config.js";
import { loadSyncJsonDirectory } from "../services/filesync/sync-json.js";
import { loadAuthHeaders } from "../services/http/auth.js";
import { http } from "../services/http/http.js";
import { LoggingArgs } from "../services/output/log/structured.js";
import { println } from "../services/output/print.js";
import { reportErrorAndExit } from "../services/output/report.js";
import { spin } from "../services/output/spinner.js";
import { sprint } from "../services/output/sprint.js";
import { symbol } from "../services/output/symbols.js";

export const description = "Connect to the debugger for your environment";

export const positional = "[DIRECTORY]";

export const positionalArgs = [{ name: "DIRECTORY", description: 'The directory containing your Gadget app (default: ".")' }] as const;

export const examples = [
  "ggt debugger",
  "ggt debugger --port 9230",
  "ggt debugger --app myApp --env development",
  "ggt debugger --configure vscode",
] as const;

const SupportedEditors = ["vscode", "cursor"] as const;

export const longDescription = sprint`
  Start a Chrome DevTools Protocol proxy server that connects to the Gadget debugger.
  This allows you to debug your Gadget app using VS Code, Chrome DevTools, or any other
  CDP-compatible debugger client.

  DIRECTORY is the directory containing your Gadget app (default: the current directory).

  Use --configure with one of: ${SupportedEditors.join(", ")} to set up editor integration.
`;

export type DebuggerArgs = typeof args;

const StartingMessage = "Starting ggt debugger";
const RunningMessage = "ggt debugger running on";

export const args = {
  ...AppIdentityArgs,
  ...LoggingArgs,
  "--port": {
    type: Number,
    alias: ["-p"],
    description: "Port for the debugger",
    valueName: "port",
  },
  "--configure": {
    type: String,
    description: "Configure the debugger for an editor",
    valueName: "editor",
  },
} satisfies ArgsDefinition;

type DebuggerSessionResponse = {
  wsUrl: string;
  lease: {
    sessionId: string;
    startedAt: string;
    expiresAt: string;
  };
};

export const run: Run<DebuggerArgs> = async (ctx, args) => {
  const directory = await loadSyncJsonDirectory(args._[0] || process.cwd());
  const appIdentity = await AppIdentity.load(ctx, { command: "debugger", args, directory });

  // Handle --configure option
  if (args["--configure"]) {
    const editor = args["--configure"].toLowerCase();
    if (!SupportedEditors.includes(editor as (typeof SupportedEditors)[number])) {
      throw new Error(`Invalid editor "${args["--configure"]}". Supported editors: ${SupportedEditors.join(", ")}`);
    }

    const configurator = new DebuggerConfigurator(directory.path);
    const port = args["--port"] ?? 9229;
    configurator.configure(port);

    println({
      ensureEmptyLineAbove: true,
      content: chalk.green(`${symbol.tick} Configured ${editor} debugger`),
    });
    println({
      content: sprint`
        Added configuration to:
        • ${configurator.launchJsonPath}
        • ${configurator.tasksJsonPath}

        You can now start debugging by running the "Gadget debugger" launch configuration.
      `,
    });
    return;
  }

  const spinner = spin(`${StartingMessage} for ${appIdentity.environment.name} environment`);
  ctx.log.info("debugger command started");

  ctx.log.trace("sync json loaded", {
    app: appIdentity.environment.application.slug,
    environment: appIdentity.environment.name,
  });

  const authHeaders = loadAuthHeaders(ctx);
  const port = args["--port"] ?? 9229;
  const sessionId = randomUUID();

  // Check if VS Code launch configuration exists
  const configurator = new DebuggerConfigurator(directory.path);
  if (!configurator.hasLaunchConfiguration()) {
    ctx.log.warn("vscode/cursor debugger configuration not found");
    println({
      ensureEmptyLineAbove: true,
      content: chalk.yellow(
        `⚠ Gadget debugger not configured. Run "${chalk.bold(`ggt debugger --configure ${SupportedEditors[0]}`)}" to set up.`,
      ),
    });
  }

  const proxy = new DebuggerProxy(ctx, {
    appIdentity,
    authHeaders,
    sessionId,
    port,
  });

  try {
    await proxy.start();

    spinner.succeed();
    println({ ensureEmptyLineAbove: true, content: chalk.green(`${symbol.tick} ${RunningMessage} ws://localhost:${port}/${sessionId}`) });
    println({ content: chalk.gray("Press Ctrl+C to stop") });

    await new Promise<void>((resolve) => {
      ctx.onAbort(() => {
        ctx.log.info("abort signal received");
        resolve();
      });
    });

    proxy.stop();
    println({ ensureEmptyLineAbove: true, content: `${symbol.tick} Proxy server stopped` });
  } catch (error) {
    ctx.log.error("debugger command failed", { error });
    await reportErrorAndExit(ctx, error);
  }
};

type DebuggerProxyOptions = {
  appIdentity: AppIdentity;
  authHeaders: Record<string, string>;
  sessionId: string;
  port: number;
};

/**
 * Manages the local debugger proxy server that connects CDP clients to the remote Gadget debugger.
 */
class DebuggerProxy {
  private readonly _ctx: Context;
  private readonly _appIdentity: AppIdentity;
  private readonly _authHeaders: Record<string, string>;
  private readonly _sessionId: string;
  private readonly _port: number;
  private readonly _subdomain: string;

  private _httpServer?: HttpServer;
  private _wsServer?: WebSocketServer;
  private _sessionManager?: DebuggerSessionManager;

  constructor(ctx: Context, options: DebuggerProxyOptions) {
    this._ctx = ctx;
    this._appIdentity = options.appIdentity;
    this._authHeaders = options.authHeaders;
    this._sessionId = options.sessionId;
    this._port = options.port;
    this._subdomain = this._buildSubdomain();
  }

  async start(): Promise<void> {
    this._sessionManager = new DebuggerSessionManager(this._ctx);
    this._httpServer = this._createHttpServer();
    this._wsServer = new WebSocketServer({ noServer: true });

    this._httpServer.on("upgrade", (request, socket, head) => {
      this._handleUpgrade(request, socket, head);
    });

    await this._listen();
  }

  stop(): void {
    this._ctx.log.debug("shutting down proxy server");
    this._wsServer?.close();
    this._httpServer?.close();
    this._ctx.log.info("proxy server stopped");
  }

  private _buildSubdomain(): string {
    const { application, name, type } = this._appIdentity.environment;
    return type === "production" ? application.slug : `${application.slug}--${name}`;
  }

  private _createHttpServer(): HttpServer {
    return createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      this._ctx.log.trace("debugger proxy http request received", {
        method: req.method,
        rUrl: req.url,
        urlPathname: url.pathname,
        url: url.toString(),
      });

      try {
        if (url.pathname === "/json/version") {
          this._handleVersionRequest(res);
        } else if (url.pathname === "/json/list") {
          this._handleListRequest(res);
        } else {
          this._handleNotFound(res, url);
        }
      } catch (error) {
        this._handleError(res, error);
      }
    });
  }

  private _handleVersionRequest(res: ServerResponse): void {
    const versionPayload = {
      "Protocol-Version": "1.1",
      Browser: `node.js/${this._appIdentity.environment.nodeVersion}`,
    };
    this._ctx.log.trace("debugger proxy http version request payload", { payload: versionPayload });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(versionPayload));
  }

  private _handleListRequest(res: ServerResponse): void {
    const listPayload = [
      {
        id: this._sessionId,
        type: "node",
        title: "ggt debugger",
        description: `authenticated CDP proxy to current sandbox process for ${this._appIdentity.environment.application.slug}@${this._appIdentity.environment.name}`,
        faviconUrl: "https://assets.gadget.dev/assets/environment/dev/favicon-32.png",
        webSocketDebuggerUrl: `ws://127.0.0.1:${this._port}/${this._sessionId}`,
      },
    ];
    this._ctx.log.trace("debugger proxy http list request payload", { payload: listPayload });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(listPayload));
  }

  private _handleNotFound(res: ServerResponse, url: URL): void {
    this._ctx.log.warn("debugger proxy http request not found", { url: url.toString() });
    res.statusCode = 404;
    res.end("Not Found");
  }

  private _handleError(res: ServerResponse, error: unknown): void {
    this._ctx.log.error("error handling debugger proxy http request", { error });
    res.statusCode = 500;
    res.end("Internal Server Error");
  }

  private _handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!this._sessionManager || !this._wsServer) {
      socket.destroy();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    this._ctx.log.trace("debugger proxy websocket upgrade request received", {
      url: request.url,
      isConnecting: this._sessionManager.isConnecting,
      hasActiveConnection: this._sessionManager.hasActiveConnection,
    });

    if (url.pathname !== `/${this._sessionId}`) {
      socket.destroy();
      return;
    }

    if (this._sessionManager.hasActiveConnection || this._sessionManager.isConnecting) {
      this._ctx.log.debug("rejecting upgrade request", {
        hasActiveConnection: this._sessionManager.hasActiveConnection,
        isConnecting: this._sessionManager.isConnecting,
      });
      this._rejectUpgrade(socket);
      return;
    }

    this._sessionManager.clearStaleConnection();
    this._acceptUpgrade(request, socket, head);
  }

  private _rejectUpgrade(socket: Duplex): void {
    const status = 409;
    const text = "Another debugger session is already running for this environment";
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }

  private _acceptUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!this._wsServer || !this._sessionManager) {
      return;
    }

    this._wsServer.handleUpgrade(request, socket, head, (clientWs) => {
      this._ctx.log.info("client websocket upgraded, establishing remote connection");
      void this._handleClientConnection(clientWs);
    });
  }

  private async _handleClientConnection(clientWs: WebSocket): Promise<void> {
    if (!this._sessionManager) {
      return;
    }

    const connection = new ClientConnection(this._ctx, clientWs, this._sessionManager);

    try {
      const remoteWs = await this._establishRemoteConnection();
      connection.connectToRemote(remoteWs);
      this._sessionManager.setActiveConnection(clientWs);
    } catch (error) {
      this._ctx.log.error("error establishing remote debugger connection", { error });
      connection.closeWithError("Failed to establish remote debugger connection");
    }
  }

  private async _establishRemoteConnection(): Promise<WebSocket> {
    const session = await http<DebuggerSessionResponse>({
      context: { ctx: this._ctx },
      method: "POST",
      url: `https://${this._subdomain}.${config.domains.app}/edit/api/debugger/start-session`,
      headers: { ...this._authHeaders, "x-gadget-debugger-session-id": this._sessionId },
      responseType: "json",
      resolveBodyOnly: true,
    });

    this._ctx.log.debug("debugger session created", { session });

    const remoteConnection = new RemoteDebuggerConnection(this._ctx, {
      wsUrl: session.wsUrl,
      sessionId: this._sessionId,
      authHeaders: this._authHeaders,
    });

    return await remoteConnection.connect();
  }

  private async _listen(): Promise<void> {
    if (!this._httpServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const server = this._httpServer;
      if (!server) {
        reject(new Error("HTTP server is not initialized"));
        return;
      }
      server.listen(this._port, "127.0.0.1", () => {
        this._ctx.log.info("debugger proxy server listening", { port: this._port });
        resolve();
      });
      server.on("error", reject);
    });
  }
}

/**
 * Manages the state of active debugger sessions and connections.
 */
class DebuggerSessionManager {
  private readonly _ctx: Context;
  private _activeConnection?: WebSocket;
  private _isConnecting = false;

  constructor(ctx: Context) {
    this._ctx = ctx;
  }

  get hasActiveConnection(): boolean {
    return !!this._activeConnection && this._activeConnection.readyState === WebSocket.OPEN;
  }

  get isConnecting(): boolean {
    return this._isConnecting;
  }

  setActiveConnection(ws: WebSocket): void {
    this._activeConnection = ws;
    this._isConnecting = false;
  }

  clearActiveConnection(): void {
    this._activeConnection = undefined;
  }

  clearStaleConnection(): void {
    if (this._activeConnection) {
      this._ctx.log.debug("clearing stale connection reference");
      this._activeConnection = undefined;
    }
  }

  startConnecting(): void {
    this._isConnecting = true;
  }

  stopConnecting(): void {
    this._isConnecting = false;
  }
}

/**
 * Manages a client connection from a CDP debugger (VS Code, Chrome DevTools, etc).
 */
class ClientConnection {
  private readonly _ctx: Context;
  private readonly _clientWs: WebSocket;
  private readonly _sessionManager: DebuggerSessionManager;
  private readonly _messageQueue: { data: RawData; isBinary: boolean }[] = [];
  private _remoteWs?: WebSocket;
  private _remoteReady = false;

  constructor(ctx: Context, clientWs: WebSocket, sessionManager: DebuggerSessionManager) {
    this._ctx = ctx;
    this._clientWs = clientWs;
    this._sessionManager = sessionManager;
    this._setupClientHandlers();
  }

  connectToRemote(remoteWs: WebSocket): void {
    this._remoteWs = remoteWs;
    this._setupRemoteHandlers();
    this._flushMessageQueue();
  }

  closeWithError(reason: string): void {
    this._sessionManager.stopConnecting();
    this._clientWs.close(1011, reason);
  }

  private _setupClientHandlers(): void {
    this._clientWs.on("message", (data: RawData, isBinary: boolean) => {
      this._handleClientMessage(data, isBinary);
    });

    this._clientWs.on("error", (error: Error) => {
      this._ctx.log.error("client websocket error", { error: error.message, stack: error.stack });
      this._remoteWs?.close();
    });

    this._clientWs.on("close", () => {
      this._ctx.log.info("client websocket closed");
      this._sessionManager.clearActiveConnection();
      this._remoteWs?.close();
    });
  }

  private _handleClientMessage(data: RawData, isBinary: boolean): void {
    // oxlint-disable-next-line no-base-to-string
    const messageString = isBinary ? "<binary data>" : String(data);
    this._ctx.log.trace("received message from client", { message: messageString });

    if (this._remoteReady && this._remoteWs) {
      this._remoteWs.send(data, { binary: isBinary });
    } else {
      this._messageQueue.push({ data, isBinary });
    }
  }

  private _setupRemoteHandlers(): void {
    if (!this._remoteWs) {
      return;
    }

    this._remoteWs.on("message", (data: RawData, isBinary: boolean) => {
      // oxlint-disable-next-line no-base-to-string
      const messageString = isBinary ? "<binary data>" : String(data);
      this._ctx.log.trace("received message from remote debugger", { message: messageString });
      this._clientWs.send(data, { binary: isBinary });
    });

    this._remoteWs.on("error", (error: Error) => {
      this._ctx.log.error("remote debugger error", { error: error.message, stack: error.stack });
      this._clientWs.close(1011, "Remote debugger connection error, please reconnect");
    });

    this._remoteWs.on("close", () => {
      this._ctx.log.info("remote debugger connection closed");
      this._clientWs.close(1011, "Remote debugger connection closed by server, please reconnect");
    });

    this._remoteReady = true;
  }

  private _flushMessageQueue(): void {
    if (!this._remoteWs) {
      return;
    }

    this._ctx.log.debug("remote debugger connected, flushing message queue", {
      queueLength: this._messageQueue.length,
    });

    for (const { data, isBinary } of this._messageQueue) {
      this._remoteWs.send(data, { binary: isBinary });
    }
    this._messageQueue.length = 0;
  }
}

type RemoteDebuggerConnectionOptions = {
  wsUrl: string;
  sessionId: string;
  authHeaders: Record<string, string>;
};

/**
 * Manages a connection to the remote Gadget debugger WebSocket.
 */
class RemoteDebuggerConnection {
  private readonly _ctx: Context;
  private readonly _wsUrl: string;
  private readonly _sessionId: string;
  private readonly _authHeaders: Record<string, string>;

  constructor(ctx: Context, options: RemoteDebuggerConnectionOptions) {
    this._ctx = ctx;
    this._wsUrl = options.wsUrl;
    this._sessionId = options.sessionId;
    this._authHeaders = options.authHeaders;
  }

  async connect(): Promise<WebSocket> {
    let resolveConnection: () => void;
    let rejectConnection: (error: Error) => void;
    let connected = false;

    const connectionPromise = new Promise<void>((resolve, reject) => {
      resolveConnection = resolve;
      rejectConnection = reject;
    });

    const ws = new WebSocket(this._wsUrl, {
      headers: { ...this._authHeaders, "x-gadget-debugger-session-id": this._sessionId },
    });

    ws.on("open", () => {
      this._ctx.log.debug("connected to remote debugger");
      if (connected) {
        return;
      }
      connected = true;
      resolveConnection();
    });

    ws.on("error", (error: Error) => {
      this._ctx.log.error("remote debugger error", { error: error.message, stack: error.stack });
      if (!connected) {
        rejectConnection(error);
      }
    });

    if (ws.readyState === WebSocket.OPEN) {
      nextTick(() => {
        resolveConnection();
      });
    }

    await connectionPromise;

    return ws;
  }
}

type VSCodeLaunchConfiguration = {
  type: string;
  request: string;
  name: string;
  address: string;
  port: number;
  localRoot: string;
  remoteRoot: string;
  preLaunchTask: string;
  restart: boolean;
  timeout: number;
};

type VSCodeTask = {
  label: string;
  type: string;
  command: string;
  isBackground: boolean;
  problemMatcher: {
    pattern: { regexp: string };
    background: {
      activeOnStart: boolean;
      beginsPattern: string;
      endsPattern: string;
    };
  };
};

/**
 * Handles VS Code/Cursor debugger configuration setup.
 */
class DebuggerConfigurator {
  private readonly _vscodeDir: string;

  constructor(directory: string) {
    this._vscodeDir = path.join(directory, ".vscode");
  }

  get launchJsonPath(): string {
    return path.join(this._vscodeDir, "launch.json");
  }

  get tasksJsonPath(): string {
    return path.join(this._vscodeDir, "tasks.json");
  }

  hasLaunchConfiguration(): boolean {
    if (!existsSync(this.launchJsonPath)) {
      return false;
    }

    try {
      const launchJson = JSON.parse(readFileSync(this.launchJsonPath, "utf-8")) as {
        configurations?: VSCodeLaunchConfiguration[];
      };
      const configurations = launchJson.configurations ?? [];
      return configurations.some((config) => config.name === "Gadget debugger");
    } catch {
      return false;
    }
  }

  configure(port: number): void {
    // Ensure .vscode directory exists
    if (!existsSync(this._vscodeDir)) {
      mkdirSync(this._vscodeDir, { recursive: true });
    }

    this._configureLaunch(port);
    this._configureTasks();
  }

  private _configureLaunch(port: number): void {
    const launchConfig: VSCodeLaunchConfiguration = {
      type: "node",
      request: "attach",
      name: "Gadget debugger",
      address: "127.0.0.1",
      port,
      localRoot: "${workspaceFolder}",
      remoteRoot: "/gadget/app",
      preLaunchTask: "ggt debugger",
      restart: true,
      timeout: 60000,
    };

    let launchJson: { version?: string; configurations: VSCodeLaunchConfiguration[] };

    if (existsSync(this.launchJsonPath)) {
      // Read existing launch.json
      const content = readFileSync(this.launchJsonPath, "utf-8");
      const parsed = JSON.parse(content) as { version?: string; configurations?: VSCodeLaunchConfiguration[] };

      // Ensure configurations array exists
      const configurations = parsed.configurations ?? [];

      // Check if configuration already exists
      const existingIndex = configurations.findIndex((config) => config.name === "Gadget debugger");

      if (existingIndex >= 0) {
        // Update existing configuration
        configurations[existingIndex] = launchConfig;
      } else {
        // Add new configuration
        configurations.push(launchConfig);
      }

      launchJson = {
        version: parsed.version,
        configurations,
      };
    } else {
      // Create new launch.json
      launchJson = {
        version: "0.2.0",
        configurations: [launchConfig],
      };
    }

    writeFileSync(this.launchJsonPath, JSON.stringify(launchJson, undefined, 2) + "\n", "utf-8");
  }

  private _configureTasks(): void {
    const task: VSCodeTask = {
      label: "ggt debugger",
      type: "shell",
      command: "ggt debugger",
      isBackground: true,
      problemMatcher: {
        pattern: { regexp: "^$" },
        background: {
          activeOnStart: true,
          beginsPattern: StartingMessage,
          endsPattern: RunningMessage,
        },
      },
    };

    let tasksJson: { version?: string; tasks: VSCodeTask[] };

    if (existsSync(this.tasksJsonPath)) {
      // Read existing tasks.json
      const content = readFileSync(this.tasksJsonPath, "utf-8");
      const parsed = JSON.parse(content) as { version?: string; tasks?: VSCodeTask[] };

      // Ensure tasks array exists
      const tasks = parsed.tasks ?? [];

      // Check if task already exists
      const existingIndex = tasks.findIndex((t) => t.label === "ggt debugger");

      if (existingIndex >= 0) {
        // Update existing task
        tasks[existingIndex] = task;
      } else {
        // Add new task
        tasks.push(task);
      }

      tasksJson = {
        version: parsed.version,
        tasks,
      };
    } else {
      // Create new tasks.json
      tasksJson = {
        version: "2.0.0",
        tasks: [task],
      };
    }

    writeFileSync(this.tasksJsonPath, JSON.stringify(tasksJson, undefined, 2) + "\n", "utf-8");
  }
}
