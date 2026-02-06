# Cursor Setup

Configure an MCP server entry in Cursor using one of these command forms.

## Recommended command

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

## Local repository command

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
Run get_channel_contents(id_or_slug="<your-channel-slug>", page=1, per=10).
```
