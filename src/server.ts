import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "./config.js";
import { ArenaClient } from "./arena/client.js";
import { registerPrompts } from "./mcp/prompts.js";
import { registerResources } from "./mcp/resources.js";
import { registerReadTools } from "./mcp/tools-read.js";
import { registerWriteTools } from "./mcp/tools-write.js";

interface CreateServerDeps {
  arenaClient?: ArenaClient;
  requireWriteScope?: (extra: unknown) => string | null;
}

export function createArenaMcpServer(config: ServerConfig, deps: CreateServerDeps = {}): McpServer {
  const arenaClient = deps.arenaClient ?? new ArenaClient(config);

  const server = new McpServer(
    {
      name: "arena-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Use search and retrieval tools before mutation tools. For local files, request a public URL first.",
    },
  );

  registerResources(server, { arenaClient });
  registerReadTools(server, {
    arenaClient,
    searchFallbackEnabled: config.arenaEnableV2SearchFallback,
  });
  registerWriteTools(server, { arenaClient, requireWriteScope: deps.requireWriteScope });
  registerPrompts(server);

  return server;
}
