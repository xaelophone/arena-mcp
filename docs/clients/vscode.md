# VS Code MCP Setup

Add an MCP server entry in your VS Code MCP configuration using one of these forms.

## npm package command

```json
{
  "name": "arena",
  "command": "npx",
  "args": ["-y", "@egotisticalengineering/arena-mcp", "arena-mcp"],
  "env": {
    "ARENA_ACCESS_TOKEN": "YOUR_TOKEN"
  }
}
```

## Local build command

```json
{
  "name": "arena",
  "command": "node",
  "args": ["/absolute/path/to/arena-mcp/dist/src/index.js"],
  "env": {
    "ARENA_ACCESS_TOKEN": "YOUR_TOKEN"
  }
}
```

## Validation Prompt

```text
Call get_user(id_or_slug="me") and summarize my profile and channel counts.
```
