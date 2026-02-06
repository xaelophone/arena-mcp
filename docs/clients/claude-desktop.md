# Claude Desktop Setup

## Prerequisites

- Node.js 22+
- Are.na personal access token
- Built server (`npm run build`) or globally installed package

## Option A: Use global binary

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

## Option B: Use project build output

```json
{
  "mcpServers": {
    "arena": {
      "command": "node",
      "args": ["/absolute/path/to/arena-mcp/dist/src/index.js"],
      "env": {
        "ARENA_ACCESS_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

## Validation Prompt

Use this in Claude after restart:

```text
List available tools from the arena MCP server, then run search_arena(query="digital garden", page=1, per=1).
```
