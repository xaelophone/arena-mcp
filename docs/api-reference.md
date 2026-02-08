# Are.na MCP API Reference

This reference documents the MCP surface exposed by this server: resources, read/write tools, and prompts.

## Conventions

- All tool calls return MCP `content` with at least one text part.
- Most successful calls include `structuredContent` for deterministic chaining.
- Some read calls also return MCP image content parts (`type: "image"`).
- On failure, tools return `isError: true` with a user-facing error message.

## Resources

### `arena://channel/{idOrSlug}`

#### What it does

Reads channel metadata and one page of contents.

#### Returns

- Markdown resource content.
- Image blob resource contents (up to 4) when image blocks are present.

#### Example

```text
arena://channel/my-channel-slug
arena://channel/owner-slug/my-channel-slug
```

### `arena://block/{id}`

#### What it does

Reads one block and connected channels.

#### Returns

- Markdown resource content.
- Image blob resource content (up to 1) when the block is an image block.

#### Example

```text
arena://block/123456
```

### `arena://user/{idOrSlug}`

#### What it does

Reads user profile and recent contents.

#### Returns

- Markdown resource content.

#### Example

```text
arena://user/username
```

### `arena://me`

#### What it does

Reads authenticated user profile and recent channels.

#### Returns

- Markdown resource content.

#### Example

```text
arena://me
```

## Read Tools

### `search_arena`

#### What it does

Searches Are.na content. Uses v3 and can fall back to v2 when v3 search is premium-gated.

#### Inputs

- `query` (string, required)
- `type?` (`All|Text|Image|Link|Attachment|Embed|Channel|Block|User|Group`)
- `scope?` (`all|my|following`)
- `page?` (int >= 1)
- `per?` (int 1..100, default `10` for this tool)
- `sort?` (`score_desc|created_at_desc|created_at_asc|updated_at_desc|updated_at_asc|name_asc|name_desc|connections_count_desc|random`)
- `after?` (ISO datetime string)
- `seed?` (positive int)
- `user_id?` (positive int)
- `group_id?` (positive int)
- `channel_id?` (positive int)
- `ext?` (string[])
- `include_raw?` (boolean, default `false`)

#### Structured content

- `source_api`: `"v3" | "v2-fallback"`
- `meta`
- `items`
- `returned_count`
- `truncated`
- `truncation_reason`
- `raw_included`
- `top_result`
- `top_result_id`
- `top_result_type`
- `top_result_title`
- `top_result_action`
- `top_result_connections_action`
- `next_page_action`
- `refine_hint`

#### Extra MCP content

None.

#### Common errors

- `401` invalid/missing token
- `403` permission issue (v3 premium-gated search may trigger v2 fallback)
- `429` rate limited

#### Example

```json
{
  "name": "search_arena",
  "arguments": {
    "query": "digital garden",
    "scope": "my",
    "per": 10
  }
}
```

### `get_channel_contents`

#### What it does

Reads a channel and one page of contents.

#### Inputs

- `id_or_slug` (string, required)
- `page?` (int >= 1)
- `per?` (int 1..100)
- `sort?` (`position_asc|position_desc|created_at_desc|created_at_asc|updated_at_desc|updated_at_asc`)
- `user_id?` (positive int)

Supported `id_or_slug` formats:

- channel id (`"12345"`)
- channel slug (`"my-channel"`)
- owner/slug (`"owner-slug/my-channel"`)
- full URL (`https://www.are.na/owner-slug/my-channel`)

#### Structured content

- `channel`
- `channel_resolution`
- `contents`
- `meta`
- `image_urls`
- `image_fetch_summary`

#### Extra MCP content

- Image content parts (`type: "image"`) up to 4.

#### Common errors

- `404` channel not found or owner/slug mismatch
- `422` invalid paging/sort inputs

#### Example

```json
{
  "name": "get_channel_contents",
  "arguments": {
    "id_or_slug": "owner-slug/my-channel",
    "page": 1,
    "per": 20
  }
}
```

### `get_block_details`

#### What it does

Reads full metadata for a block plus connected channels.

#### Inputs

- `id` (positive int, required)

#### Structured content

- `block`
- `connections`
- `meta`
- `image_urls`
- `image_fetch_summary`

#### Extra MCP content

- Image content part (`type: "image"`) up to 1.

#### Common errors

- `404` block not found

#### Example

```json
{
  "name": "get_block_details",
  "arguments": {
    "id": 123456
  }
}
```

### `get_block_connections`

#### What it does

Lists channels where a block appears.

#### Inputs

- `id` (positive int, required)
- `page?` (int >= 1)
- `per?` (int 1..100)
- `sort?` (`created_at_desc|created_at_asc`)
- `filter?` (`ALL|OWN|EXCLUDE_OWN`)

#### Structured content

- `channels`
- `meta`

#### Extra MCP content

None.

#### Common errors

- `404` block not found

#### Example

```json
{
  "name": "get_block_connections",
  "arguments": {
    "id": 123456,
    "page": 1,
    "per": 25,
    "filter": "ALL"
  }
}
```

### `get_user`

#### What it does

Reads user profile details and recent contents.

#### Inputs

- `id_or_slug` (string, required)

#### Structured content

- `user`
- `recent_contents`
- `meta`

#### Extra MCP content

None.

#### Common errors

- `404` user not found

#### Example

```json
{
  "name": "get_user",
  "arguments": {
    "id_or_slug": "username"
  }
}
```

### `get_user_contents`

#### What it does

Reads paginated contents for a user.

#### Inputs

- `id_or_slug` (string, required)
- `page?` (int >= 1)
- `per?` (int 1..100)
- `sort?` (`created_at_desc|created_at_asc|updated_at_desc|updated_at_asc`)
- `type?` (`Text|Image|Link|Attachment|Embed|Channel|Block`)

#### Structured content

- `user`
- `contents`
- `meta`

#### Extra MCP content

None.

#### Common errors

- `404` user not found

#### Example

```json
{
  "name": "get_user_contents",
  "arguments": {
    "id_or_slug": "username",
    "type": "Channel",
    "page": 1,
    "per": 10
  }
}
```

## Write Tools

### `create_channel`

#### What it does

Creates a new channel for the authenticated user.

#### Inputs

- `title` (string, required)
- `visibility?` (`public|private|closed`, default `closed`)
- `description?` (string)
- `group_id?` (positive int)

#### Structured content

- `channel`
- `url`

#### Common errors

- `401` invalid/missing token
- `403` missing write scope (HTTP mode with read-only key)
- `422` validation failure

#### Example

```json
{
  "name": "create_channel",
  "arguments": {
    "title": "Research Inbox",
    "visibility": "closed"
  }
}
```

### `create_block`

#### What it does

Creates a text/link/media block and connects it to one or more channels.

#### Inputs

- `value` (string, required)
- `channel_ids` (positive int[], required, min 1, max 20)
- `title?` (string)
- `description?` (string)
- `original_source_url?` (URL string)
- `original_source_title?` (string)
- `alt_text?` (string)
- `insert_at?` (int >= 0)

Notes:

- Local file paths are rejected; use public URLs or text.
- Write path is v3-only in current implementation.

#### Structured content

- `block`

#### Common errors

- `403` missing write scope
- `422` invalid payload (for example empty `channel_ids`)

#### Example

```json
{
  "name": "create_block",
  "arguments": {
    "value": "https://example.com/article",
    "title": "Reference",
    "channel_ids": [12345]
  }
}
```

### `connect_block`

#### What it does

Connects an existing block to one or more channels.

#### Inputs

- `block_id` (positive int, required)
- `channel_ids` (positive int[], required, min 1, max 20)
- `position?` (int >= 0)

#### Structured content

- `connection`

#### Common errors

- `403` missing write scope
- `404` block or channel not found

#### Example

```json
{
  "name": "connect_block",
  "arguments": {
    "block_id": 123456,
    "channel_ids": [12345],
    "position": 0
  }
}
```

### `disconnect_connection`

#### What it does

Removes a connection by connection ID.

#### Inputs

- `connection_id` (positive int, required)

#### Structured content

- `connection_id`
- `disconnected` (`true`)

#### Common errors

- `403` missing write scope
- `404` connection not found

#### Example

```json
{
  "name": "disconnect_connection",
  "arguments": {
    "connection_id": 98765
  }
}
```

### `move_connection`

#### What it does

Repositions a connection within a channel.

#### Inputs

- `connection_id` (positive int, required)
- `movement` (`insert_at|move_to_top|move_to_bottom|move_up|move_down`, required)
- `position?` (int >= 0, required when `movement=insert_at`)

#### Structured content

- `connection`

#### Common errors

- `403` missing write scope
- `422` missing/invalid `position` for `insert_at`

#### Example

```json
{
  "name": "move_connection",
  "arguments": {
    "connection_id": 98765,
    "movement": "move_to_top"
  }
}
```

## Prompts

### `summarize_channel`

#### What it does

Generates instructions to synthesize themes, clusters, and tensions inside a channel.

#### Args

- `id_or_slug` (string, required)
- `focus?` (string)

#### Example

```json
{
  "name": "summarize_channel",
  "arguments": {
    "id_or_slug": "owner-slug/my-channel",
    "focus": "connections between design and systems"
  }
}
```

### `find_connections`

#### What it does

Generates instructions for proposing channel connection candidates for a block.

#### Args

- `block_id` (positive int, required)
- `max_suggestions?` (int 1..10)

#### Example

```json
{
  "name": "find_connections",
  "arguments": {
    "block_id": 123456,
    "max_suggestions": 5
  }
}
```

### `second_brain_synthesis`

#### What it does

Generates instructions for multi-step topic synthesis over search and retrieval.

#### Args

- `topic` (string, required)
- `scope?` (`all|my|following`)

#### Example

```json
{
  "name": "second_brain_synthesis",
  "arguments": {
    "topic": "ambient interfaces",
    "scope": "my"
  }
}
```

## Response and Error Notes

Typical status mappings:

- `401`: token/auth issue (`ARENA_ACCESS_TOKEN`, or HTTP bearer key)
- `403`: permission issue (or premium-gated v3 search)
- `404`: resource not found
- `422`: validation error
- `429`: rate limit

For retry and translation behavior, see:

- `src/arena/client.ts`
- `src/errors.ts`

## Quick Example Chains

### Search -> drill down top result

1. `search_arena(query="digital garden", type="Block", per=5)`
2. Read `structuredContent.top_result_action`
3. Call that action
4. If block, call `get_block_connections(id=top_result_id)`

### Deterministic write verification

1. `create_channel(...)`
2. Read `structuredContent.channel.id` as `CH_ID`
3. `create_block(..., channel_ids=[CH_ID])`
4. Read `structuredContent.block.id` as `BL_ID`
5. Verify with `get_block_connections(id=BL_ID)` and `get_channel_contents(id_or_slug=String(CH_ID))`
