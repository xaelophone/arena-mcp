# Are.na MCP

Graph-native MCP server for Are.na. Designed for local use in MCP clients (Claude Desktop, Cursor, VS Code), with optional self-hosted HTTP mode.

## Install

```bash
npm install
npm run build
```

## Quickstart (Local STDIO - Recommended)

Local STDIO mode is the default and best compatibility path for MCP clients.

```bash
export ARENA_ACCESS_TOKEN="YOUR_TOKEN"
npm run start
```

Or run directly from GitHub:

```bash
ARENA_ACCESS_TOKEN="YOUR_TOKEN" npm exec --yes --package=github:xaelophone/arena-mcp arena-mcp
```

## MCP Client Config

Use one of these command patterns in your MCP client config:

```json
{
  "mcpServers": {
    "arena": {
      "command": "arena-mcp",
      "env": {
        "ARENA_ACCESS_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

GitHub-based command (no npm publish required):

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

Client-specific setup docs:

- `docs/clients/claude-desktop.md`
- `docs/clients/cursor.md`
- `docs/clients/vscode.md`

## Optional HTTP Mode (Advanced)

Run as a remote Streamable HTTP MCP server:

```bash
export ARENA_ACCESS_TOKEN="YOUR_TOKEN"
export MCP_HTTP_READ_KEYS="read-key-1"
export MCP_HTTP_WRITE_KEYS="write-key-1"
npm run start:http
```

For PaaS deployments, use a start command that builds first:

```bash
npm run build && npm run start:http
```

HTTP endpoint defaults:

- Host: `0.0.0.0`
- Port: `8787`
- Path: `/mcp`

Full HTTP deployment and auth details:

- `docs/self-host-http.md`

## Environment Variables

Core:

- `ARENA_ACCESS_TOKEN` (required)
- `ARENA_API_BASE_URL` (default: `https://api.are.na`)
- `ARENA_API_TIMEOUT_MS` (default: `15000`)
- `ARENA_MAX_RETRIES` (default: `5`)
- `ARENA_BACKOFF_BASE_MS` (default: `500`)
- `ARENA_MAX_CONCURRENT_REQUESTS` (default: `4`)
- `ARENA_DEFAULT_PER_PAGE` (default: `50`, clamped `1..100`)
- `ARENA_ENABLE_V2_SEARCH_FALLBACK` (default: `true`)
- `ARENA_IMAGE_FETCH_TIMEOUT_MS` (default: `10000`)
- `ARENA_IMAGE_FETCH_MAX_BYTES` (default: `2000000`)
- `ARENA_IMAGE_FETCH_MAX_CONCURRENT` (default: `3`)
- `ARENA_IMAGE_FETCH_USER_AGENT` (default: browser-like UA string)

HTTP mode:

- `MCP_HTTP_HOST` (default: `0.0.0.0`)
- `MCP_HTTP_PORT` (default: `8787`)
- `MCP_HTTP_PATH` (default: `/mcp`)
- `MCP_HTTP_STATEFUL` (default: `true`)
- `MCP_HTTP_READ_KEYS` (required for HTTP mode, CSV)
- `MCP_HTTP_WRITE_KEYS` (optional, CSV)
- `MCP_HTTP_ENABLE_CORS` (default: `false`)
- `MCP_HTTP_ALLOWED_ORIGINS` (optional CSV)

## Available Capabilities

Resources:

- `arena://channel/{idOrSlug}`
- `arena://block/{id}`
- `arena://user/{idOrSlug}`
- `arena://me`

Read tools:

- `search_arena`
- `get_channel_contents`
- `get_block_details`
- `get_block_connections`
- `get_user`
- `get_user_contents`

Write tools:

- `create_channel`
- `create_block`
- `connect_block`
- `disconnect_connection`
- `move_connection`

Prompts:

- `summarize_channel`
- `find_connections`
- `second_brain_synthesis`

## Validation

```bash
npm run lint
npm run typecheck
npm test
```

STDIO smoke test (requires a real token):

```bash
ARENA_ACCESS_TOKEN="YOUR_TOKEN" npm run build && npm run smoke:stdio
```

## Landing Page

```bash
npm run landing
```

Open `http://localhost:4173`.

## Developer Docs

- `docs/developer-guide.md`
- `docs/api-reference.md`

## Distribution

Primary distribution is GitHub source + GitHub-based execution.

```bash
npm exec --yes --package=github:xaelophone/arena-mcp arena-mcp
```

Release workflow still runs validation and can optionally publish to npm later if you set npm credentials.
