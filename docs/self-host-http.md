# Self-Host HTTP Mode

This server supports Streamable HTTP transport for remote MCP clients.

## Why this is optional

Local STDIO is the simplest and safest default. HTTP mode is for advanced deployments where you need a shared endpoint.

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
```

## Start Server

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

## Quick Remote Smoke Test

1. Connect an HTTP-capable MCP client to your endpoint.
2. List tools and confirm read + write tools are present.
3. Call `search_arena` with a read key (should succeed).
4. Call `create_channel` with a read key (should return access denied).
5. Call `create_channel` with a write key (should succeed).
