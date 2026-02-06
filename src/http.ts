#!/usr/bin/env node

import type { IncomingMessage, ServerResponse } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadHttpConfig, type HttpServerConfig } from "./config.js";
import { createArenaMcpServer } from "./server.js";
import { buildAuthInfoFromToken, hasWriteScope, parseBearerToken } from "./http/auth.js";

interface SessionRuntime {
  transport: StreamableHTTPServerTransport;
  closeServer: () => Promise<void>;
}

type AuthenticatedRequest = Request & { auth?: AuthInfo };

function writeScopeError(): string {
  return "Access denied for write operation. Use a write API key for create/connect/disconnect/move tools.";
}

function setCorsHeaders(req: Request, res: Response, config: HttpServerConfig): void {
  const origin = req.header("origin");
  if (!origin) {
    return;
  }
  const allowedOrigins = config.mcpHttpAllowedOrigins;
  const allowAny = allowedOrigins.length === 0;
  const allowed = allowAny || allowedOrigins.includes(origin);
  if (!allowed) {
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", allowAny ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id, Last-Event-ID");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

function sendUnauthorized(res: Response): void {
  res.setHeader("WWW-Authenticate", 'Bearer realm="arena-mcp"');
  res.status(401).json({
    error: "Unauthorized",
    message: "Provide a valid Bearer token in the Authorization header.",
  });
}

async function createRuntime(
  config: HttpServerConfig,
  sessions: Map<string, SessionRuntime>,
): Promise<SessionRuntime> {
  let runtimeRef: SessionRuntime | null = null;
  let closed = false;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: config.mcpHttpStateful ? () => randomUUID() : undefined,
    onsessioninitialized: (sessionId) => {
      if (runtimeRef) {
        sessions.set(sessionId, runtimeRef);
      }
    },
  });

  const server = createArenaMcpServer(config, {
    requireWriteScope: (extra) => {
      const authInfo = (extra as { authInfo?: AuthInfo } | undefined)?.authInfo;
      return hasWriteScope(authInfo) ? null : writeScopeError();
    },
  });

  const closeServer = async () => {
    if (closed) {
      return;
    }
    closed = true;
    await server.close();
  };

  const runtime: SessionRuntime = { transport, closeServer };
  runtimeRef = runtime;

  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    void closeServer();
  };

  await server.connect(transport);
  return runtime;
}

async function withEphemeralRuntime(
  config: HttpServerConfig,
  sessions: Map<string, SessionRuntime>,
  handler: (runtime: SessionRuntime) => Promise<void>,
): Promise<void> {
  const runtime = await createRuntime(config, sessions);
  await handler(runtime);
  await runtime.transport.close();
  await runtime.closeServer();
}

async function main(): Promise<void> {
  const config = loadHttpConfig();
  const app = createMcpExpressApp({ host: config.mcpHttpHost });
  app.use(express.json({ limit: "2mb" }));

  if (config.mcpHttpEnableCors) {
    app.use((req, res, next) => {
      setCorsHeaders(req, res, config);
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  const sessions = new Map<string, SessionRuntime>();

  app.use(config.mcpHttpPath, (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = parseBearerToken(req.header("authorization"));
    if (!token) {
      sendUnauthorized(res);
      return;
    }

    const authInfo = buildAuthInfoFromToken(token, {
      readKeys: config.mcpHttpReadKeys,
      writeKeys: config.mcpHttpWriteKeys,
    });
    if (!authInfo) {
      sendUnauthorized(res);
      return;
    }

    req.auth = authInfo;
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  app.get("/readyz", (_req, res) => {
    res.status(200).json({ status: "ready", mode: config.mcpHttpStateful ? "stateful" : "stateless" });
  });

  app.post(config.mcpHttpPath, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!config.mcpHttpStateful) {
        await withEphemeralRuntime(config, sessions, async (runtime) => {
          await runtime.transport.handleRequest(
            req as IncomingMessage & { auth?: AuthInfo },
            res as unknown as ServerResponse,
            req.body,
          );
        });
        return;
      }

      const sessionIdHeader = req.header("mcp-session-id");
      if (sessionIdHeader) {
        const runtime = sessions.get(sessionIdHeader);
        if (!runtime) {
          res.status(404).json({
            error: "Session not found",
            message: "Invalid MCP session ID. Initialize a new session first.",
          });
          return;
        }
        await runtime.transport.handleRequest(
          req as IncomingMessage & { auth?: AuthInfo },
          res as unknown as ServerResponse,
          req.body,
        );
        return;
      }

      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          error: "Bad Request",
          message: "Missing MCP session ID. Send initialize first or include MCP-Session-Id.",
        });
        return;
      }

      const runtime = await createRuntime(config, sessions);
      await runtime.transport.handleRequest(
        req as IncomingMessage & { auth?: AuthInfo },
        res as unknown as ServerResponse,
        req.body,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message,
        });
      }
    }
  });

  app.get(config.mcpHttpPath, async (req: AuthenticatedRequest, res: Response) => {
    if (!config.mcpHttpStateful) {
      res.status(405).json({
        error: "Method Not Allowed",
        message: "GET is unsupported in stateless mode.",
      });
      return;
    }

    const sessionId = req.header("mcp-session-id");
    if (!sessionId) {
      res.status(400).json({
        error: "Bad Request",
        message: "MCP-Session-Id header is required for GET streaming requests.",
      });
      return;
    }

    const runtime = sessions.get(sessionId);
    if (!runtime) {
      res.status(404).json({
        error: "Session not found",
        message: "Invalid MCP session ID.",
      });
      return;
    }

    await runtime.transport.handleRequest(
      req as IncomingMessage & { auth?: AuthInfo },
      res as unknown as ServerResponse,
    );
  });

  app.delete(config.mcpHttpPath, async (req: AuthenticatedRequest, res: Response) => {
    if (!config.mcpHttpStateful) {
      res.status(405).json({
        error: "Method Not Allowed",
        message: "DELETE is unsupported in stateless mode.",
      });
      return;
    }

    const sessionId = req.header("mcp-session-id");
    if (!sessionId) {
      res.status(400).json({
        error: "Bad Request",
        message: "MCP-Session-Id header is required for DELETE requests.",
      });
      return;
    }

    const runtime = sessions.get(sessionId);
    if (!runtime) {
      res.status(404).json({
        error: "Session not found",
        message: "Invalid MCP session ID.",
      });
      return;
    }

    await runtime.transport.handleRequest(
      req as IncomingMessage & { auth?: AuthInfo },
      res as unknown as ServerResponse,
    );
    sessions.delete(sessionId);
  });

  const server = app.listen(config.mcpHttpPort, config.mcpHttpHost, () => {
    process.stdout.write(
      `Are.na MCP HTTP server listening on http://${config.mcpHttpHost}:${config.mcpHttpPort}${config.mcpHttpPath}\n`,
    );
  });

  const shutdown = async () => {
    for (const runtime of sessions.values()) {
      await runtime.transport.close();
      await runtime.closeServer();
    }
    sessions.clear();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to start Are.na MCP HTTP server: ${message}\n`);
  process.exitCode = 1;
});
