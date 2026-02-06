import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function toStringEnv(inputEnv) {
  const result = {};
  for (const [key, value] of Object.entries(inputEnv)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

async function main() {
  const token = process.env.ARENA_ACCESS_TOKEN;
  if (!token) {
    throw new Error("ARENA_ACCESS_TOKEN is required for smoke:stdio.");
  }

  const serverCommand = process.env.MCP_SMOKE_COMMAND || "node";
  const serverArgs = process.env.MCP_SMOKE_ARGS
    ? process.env.MCP_SMOKE_ARGS.split(" ").filter((value) => value.trim().length > 0)
    : [path.resolve(process.cwd(), "dist/src/index.js")];

  const transport = new StdioClientTransport({
    command: serverCommand,
    args: serverArgs,
    env: {
      ...toStringEnv(process.env),
      ARENA_ACCESS_TOKEN: token,
    },
    cwd: process.cwd(),
  });

  const client = new Client(
    { name: "arena-mcp-smoke-client", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const resources = await client.listResources();
    const prompts = await client.listPrompts();

    const searchResult = await client.callTool({
      name: "search_arena",
      arguments: { query: "digital garden", page: 1, per: 1 },
    });

    const structured = searchResult.structuredContent ?? {};

    const summary = {
      ok: true,
      server_command: serverCommand,
      server_args: serverArgs,
      tools_count: tools.tools.length,
      resources_count: resources.resources.length,
      prompts_count: prompts.prompts.length,
      source_api: structured.source_api ?? null,
      top_result_id: structured.top_result_id ?? null,
      top_result_type: structured.top_result_type ?? null,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Smoke test failed: ${message}\n`);
  process.exitCode = 1;
});
