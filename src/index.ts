#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createArenaMcpServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createArenaMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to start Are.na MCP server: ${message}\n`);
  process.exitCode = 1;
});
