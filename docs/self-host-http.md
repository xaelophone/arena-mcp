# Self-Host HTTP Mode

This server supports Streamable HTTP transport for remote MCP clients.

Use this mode when you want one persistent endpoint (for example on Railway) shared across multiple apps.

## Why this is optional

Local STDIO is still the simplest default for many desktop clients. HTTP mode adds deployment and credential management overhead, but enables a single shared remote endpoint.

## Required Environment

```bash
ARENA_ACCESS_TOKEN="YOUR_ARENA_TOKEN"
MCP_HTTP_READ_KEYS="read-key-1,read-key-2"
```

Optional:

```bash
MCP_HTTP_WRITE_KEYS="write-key-1"
MCP_HTTP_HOST="0.0.0.0"
MCP_HTTP_PORT="8787"
MCP_HTTP_PATH="/mcp"
MCP_HTTP_STATEFUL="true"
MCP_HTTP_ENABLE_CORS="false"
MCP_HTTP_ALLOWED_ORIGINS="https://example-client.com"
ARENA_IMAGE_FETCH_TIMEOUT_MS="10000"
ARENA_IMAGE_FETCH_MAX_BYTES="2000000"
ARENA_IMAGE_FETCH_MAX_CONCURRENT="3"
ARENA_IMAGE_FETCH_USER_AGENT="Mozilla/5.0 ..."
```

## Railway Quickstart

1. Create a Railway service from this GitHub repo.
2. Set the start command to:

```bash
npm run build && npm run start:http
```

3. In Railway Variables, set:

```env
ARENA_ACCESS_TOKEN=YOUR_ARENA_TOKEN
MCP_HTTP_READ_KEYS=YOUR_LONG_RANDOM_READ_KEY
MCP_HTTP_WRITE_KEYS=YOUR_LONG_RANDOM_WRITE_KEY
MCP_HTTP_HOST=0.0.0.0
MCP_HTTP_PORT=8080
MCP_HTTP_PATH=/mcp
MCP_HTTP_STATEFUL=true
MCP_HTTP_ENABLE_CORS=false
```

4. In Railway Networking, generate a public domain and set target port to `8080`.
5. Deploy/redeploy.

## Generic Start Server

```bash
npm run build
npm run start:http
```

Endpoint example:

- `http://0.0.0.0:8787/mcp`

Health endpoints:

- `GET /healthz`
- `GET /readyz`

## Authentication Model

- All requests require `Authorization: Bearer <key>`.
- Keys in `MCP_HTTP_READ_KEYS` can call read tools/resources/prompts.
- Keys in `MCP_HTTP_WRITE_KEYS` can also call write tools.
- Write tool calls with read-only keys return an explicit access-denied tool error.

## Client Requirements

- Client must support remote MCP over HTTP/Streamable HTTP.
- Client must support custom request headers.
- For MCP POST, include:
  - `Authorization: Bearer <key>`
  - `Accept: application/json, text/event-stream`
  - `Content-Type: application/json`

## Quick Smoke Tests

Replace `BASE_URL` with your deployment URL, for example `https://example.up.railway.app`.

```bash
BASE_URL="https://example.up.railway.app"
READ_KEY="YOUR_LONG_RANDOM_READ_KEY"
```

Health and readiness:

```bash
curl -i "$BASE_URL/healthz"
curl -i "$BASE_URL/readyz"
```

Expected:
- `/healthz` => `200`
- `/readyz` => `200` with `{"status":"ready","mode":"stateful"}` (if stateful)

Auth gate checks:

```bash
curl -i "$BASE_URL/mcp"
curl -i -X POST "$BASE_URL/mcp" -H "Content-Type: application/json" --data '{}'
```

Expected:
- both should return `401 Unauthorized` when no bearer key is present

Initialize check:

```bash
curl -i -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer $READ_KEY" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0.0"}}}'
```

Expected:
- `200`
- `content-type: text/event-stream`
- `mcp-session-id` response header

## Troubleshooting

### `502 Application failed to respond` at the public URL

Usually port/start-command mismatch.

Check:
- Start command is `npm run build && npm run start:http`
- App listens on the same target port configured in Railway Networking
- `MCP_HTTP_HOST=0.0.0.0`

### `500 InternalServerError: stream is not readable` on `POST /mcp`

This indicates request body stream consumption conflict. Use the latest repo version that includes the HTTP parsing fix and redeploy from latest `main`.

### `401 Unauthorized` on `/mcp`

Expected when auth header is missing or invalid.

Use:
- `Authorization: Bearer <read-or-write-key>`

### `406 Not Acceptable` during initialize

Client is missing required `Accept` header.

Use:
- `Accept: application/json, text/event-stream`

## Deployment Targets

Use a long-running Node host:

- Railway
- Render
- Fly.io
- VPS/VM

Do not use static hosting for MCP runtime. Static hosting is only for the landing page.

## Security Checklist

- Use HTTPS in production.
- Keep `ARENA_ACCESS_TOKEN` server-side only.
- Rotate `MCP_HTTP_READ_KEYS` / `MCP_HTTP_WRITE_KEYS` regularly.
- Disable CORS unless browser-based clients require it.
- Use read-only keys by default; issue write keys only to trusted automations.
