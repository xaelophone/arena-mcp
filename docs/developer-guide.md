# Are.na MCP Developer Guide

This guide documents how to run, extend, and verify the Are.na MCP server in this repository.

Companion reference:
- `docs/api-reference.md` for concrete resource/tool/prompt signatures and response shapes.

## 1) Runtime and Entry Points

- Runtime: Node 22+, TypeScript, ESM.
- MCP transports:
  - STDIO (default) via `@modelcontextprotocol/sdk/server/stdio.js`
  - Streamable HTTP (optional) via `@modelcontextprotocol/sdk/server/streamableHttp.js`
- Process entrypoints:
  - `src/index.ts` for local STDIO
  - `src/http.ts` for self-hosted HTTP
- Server wiring: `src/server.ts`.

Server startup flow:
1. `loadConfig()` reads and validates environment variables.
2. `createArenaMcpServer(config)` registers resources, read tools, write tools, and prompts.
3. `StdioServerTransport` is connected and the process waits for MCP messages.

## 2) Configuration

Required:
- `ARENA_ACCESS_TOKEN`

Optional:
- `ARENA_API_BASE_URL` (default `https://api.are.na`)
- `ARENA_API_TIMEOUT_MS` (default `15000`)
- `ARENA_MAX_RETRIES` (default `5`)
- `ARENA_BACKOFF_BASE_MS` (default `500`)
- `ARENA_MAX_CONCURRENT_REQUESTS` (default `4`)
- `ARENA_DEFAULT_PER_PAGE` (default `50`, clamped `1..100`)
- `ARENA_ENABLE_V2_SEARCH_FALLBACK` (default `true`)
- `ARENA_IMAGE_FETCH_TIMEOUT_MS` (default `10000`)
- `ARENA_IMAGE_FETCH_MAX_BYTES` (default `2000000`)
- `ARENA_IMAGE_FETCH_MAX_CONCURRENT` (default `3`)
- `ARENA_IMAGE_FETCH_USER_AGENT` (default browser-like UA)

HTTP mode only:
- `MCP_HTTP_HOST` (default `0.0.0.0`)
- `MCP_HTTP_PORT` (default `8787`)
- `MCP_HTTP_PATH` (default `/mcp`)
- `MCP_HTTP_STATEFUL` (default `true`)
- `MCP_HTTP_READ_KEYS` (required, CSV)
- `MCP_HTTP_WRITE_KEYS` (optional, CSV)
- `MCP_HTTP_ENABLE_CORS` (default `false`)
- `MCP_HTTP_ALLOWED_ORIGINS` (optional CSV)

## 3) Running Locally

Install:
```bash
npm install
```

Development (STDIO):
```bash
npm run dev
```

Build and run (STDIO):
```bash
npm run build
npm run start
```

HTTP mode:
```bash
npm run build
export MCP_HTTP_READ_KEYS="read-key-1"
npm run start:http
```

## 4) MCP Surface

### Resources

- `arena://channel/{idOrSlug}`
- `arena://block/{id}`
- `arena://user/{idOrSlug}`
- `arena://me`

Resource responses include markdown text. Channel and block resources additionally include image blobs when image blocks are present.

### Read Tools

- `search_arena(query, type?, scope?, page?, per?, sort?, after?, seed?, user_id?, group_id?, channel_id?, ext?)`
- `get_channel_contents(id_or_slug, page?, per?, sort?, user_id?)`
- `get_block_details(id)`
- `get_block_connections(id, page?, per?, sort?, filter?)`
- `get_user(id_or_slug)`
- `get_user_contents(id_or_slug, page?, per?, sort?, type?)`

### Write Tools

- `create_channel(title, visibility?, description?, group_id?)`
- `create_block(value, channel_ids, title?, description?, original_source_url?, original_source_title?, alt_text?, insert_at?)`
- `connect_block(block_id, channel_ids, position?)`
- `disconnect_connection(connection_id)`
- `move_connection(connection_id, movement, position?)`

### Prompts

- `summarize_channel`
- `find_connections`
- `second_brain_synthesis`

## 5) Image Return Behavior

Image payloads are returned in two forms:
1. Markdown image references in text output.
2. MCP binary image content (for clients that render image parts directly).

Current limits:
- Channel reads: up to 4 images per call.
- Block detail reads: up to 1 image per call.
- Per-image download cap: 2 MB (configurable).
- Image fetch timeout: 10 seconds (configurable).
- Image fetches include a browser-like User-Agent by default.
- Multi-variant fallback is attempted in order: `src -> large -> medium -> small -> square`.
- Tool responses include `image_fetch_summary` diagnostics for success/failure visibility.

Image behavior is implemented in `src/mcp/images.ts`.

## 6) Channel Resolution Rules

`get_channel_contents(id_or_slug=...)` supports:
- raw channel id (`"12345"`)
- raw slug (`"my-channel-slug"`)
- owner/slug input (`"owner-slug/my-channel-slug"`)
- full Are.na URL (`https://www.are.na/owner-slug/my-channel-slug`)

Resolution behavior:
1. Attempt direct channel lookup.
2. On 404, search channels in `scope="my"` and resolve by exact slug/title/single match.
3. If owner slug is provided (owner/slug or URL), owner mismatch fails fast.

Resolution metadata is returned in `structuredContent.channel_resolution`.

## 7) Search Fallback Policy

- Primary search endpoint: `/v3/search`.
- If `/v3/search` returns `403` and fallback is enabled, retry via `/v2/search`.
- `structuredContent.source_api` indicates `v3` or `v2-fallback`.

Note: write operations are v3-only in current implementation.

## 8) Error Mapping

Errors are translated to user-facing messages in `src/errors.ts`.
Status handling:
- `400`: invalid request
- `401`: token/auth issue
- `403`: permission issue (special handling for premium-gated search)
- `404`: not found
- `422`: validation failure
- `429`: rate limit
- `5xx`: temporary upstream failure

## 9) Testing and Validation

Run full validation:
```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Core test files:
- `test/client.test.ts` (API client behavior, retry/fallback)
- `test/server-smoke.test.ts` (MCP registration and tool behavior)
- `test/images.test.ts` (image extraction and content rendering path)
- `test/markdown.test.ts` (formatters)
- `test/payloads.test.ts` (write payload validation)
- `test/errors.test.ts` (error mapping)

## 10) Extending the Server

When adding a new capability:
1. Add or update normalized types in `src/arena/types.ts`.
2. Add normalization logic in `src/arena/normalize.ts` as needed.
3. Add API client methods in `src/arena/client.ts`.
4. Register new MCP tools/resources/prompts under `src/mcp`.
5. Add tests first for payload/behavior and smoke coverage.
6. Update `README.md` and this guide.

## 11) Claude Desktop Configuration Example

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
