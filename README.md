# Are.na MCP

<p align="center">
  <img src="./landing/assets/logo.svg" alt="Are.na MCP logo" width="180" />
</p>

Graph-native MCP server for Are.na.

Compatible with any MCP client that supports command-based servers (for example Claude Desktop, Cursor, and VS Code).

## Quick Start (Local STDIO)

Requirements:

- Node.js 22+
- Are.na personal access token

Run directly from GitHub (recommended):

```bash
ARENA_ACCESS_TOKEN="YOUR_TOKEN" npm exec --yes --package=github:xaelophone/arena-mcp arena-mcp
```

Or run from a local clone:

```bash
npm install
npm run build
ARENA_ACCESS_TOKEN="YOUR_TOKEN" npm run start
```

## MCP Client Config

Generic command pattern:

```json
{
  "mcpServers": {
    "arena": {
      "command": "npx",
      "args": ["--yes", "--package=github:xaelophone/arena-mcp", "arena-mcp"],
      "env": {
        "ARENA_ACCESS_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

Client-specific setup:

- [Claude Desktop](./docs/clients/claude-desktop.md)
- [Cursor](./docs/clients/cursor.md)
- [VS Code](./docs/clients/vscode.md)

## Known Issues and Workarounds

- `search_arena` may hit `403` on v3 endpoints for premium-gated contexts. By default the server retries via v2 when `ARENA_ENABLE_V2_SEARCH_FALLBACK=true`.
- Remote HTTP clients must send `Accept: application/json, text/event-stream` during MCP initialize, or you can get `406 Not Acceptable`.
- Missing/invalid auth keys on HTTP mode return `401 Unauthorized` on `/mcp`.

Details and troubleshooting:

- [Self-host HTTP mode](./docs/self-host-http.md#troubleshooting)
- [API reference: response and error notes](./docs/api-reference.md#response-and-error-notes)

## Docs

Start here:

- [Docs index](./docs/README.md)

Core references:

- [API reference](./docs/api-reference.md)
- [Self-host HTTP mode](./docs/self-host-http.md)
- [Developer guide](./docs/developer-guide.md)
- [Docs maintenance checklist](./docs/maintenance.md)

## Validation

```bash
npm run docs:check
npm run lint
npm run typecheck
npm test
npm run build
```

STDIO smoke test (requires real token):

```bash
ARENA_ACCESS_TOKEN="YOUR_TOKEN" npm run build && npm run smoke:stdio
```

## Landing Page

```bash
npm run landing
```

Open `http://localhost:4173`.
