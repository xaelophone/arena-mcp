# Are.na MCP API Reference

This reference describes the MCP surface exposed by this server: resources, tools, prompts, and common response shapes.

## Conventions

- All tool calls return MCP `content` with at least one text part.
- Some read calls also return MCP image parts (`type: "image"`) when image data is available.
- Most successful tool calls include `structuredContent` for deterministic chaining.
- On failure, tools return `isError: true` and a user-facing error message.

## Resources

### `arena://channel/{idOrSlug}`

Reads channel metadata and one page of contents.

Returns:
- markdown resource content
- image blob resource contents (up to 4), when image blocks are present

### `arena://block/{id}`

Reads one block and connected channels.

Returns:
- markdown resource content
- image blob resource content (up to 1), when the block is an image block

### `arena://user/{idOrSlug}`

Reads user profile and recent contents.

Returns:
- markdown resource content

### `arena://me`

Reads authenticated user profile and recent channels.

Returns:
- markdown resource content

## Read Tools

### `search_arena`

Inputs:
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
- `include_raw?` (boolean, default `false`; include large upstream raw payloads when `true`)

Structured content keys:
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

### `get_channel_contents`

Inputs:
- `id_or_slug` (string, required)
- `page?` (int >= 1)
- `per?` (int 1..100)
- `sort?` (`position_asc|position_desc|created_at_desc|created_at_asc|updated_at_desc|updated_at_asc`)
- `user_id?` (positive int)

Supports `id_or_slug` formats:
- channel id (`"12345"`)
- channel slug (`"my-channel"`)
- owner/slug (`"owner-slug/my-channel"`)
- full URL (`https://www.are.na/owner-slug/my-channel`)

Structured content keys:
- `channel`
- `channel_resolution`:
  - `input`
  - `resolved_id_or_slug`
  - `strategy`
  - `expected_owner_slug`
  - `actual_owner_slug`
  - `search_source_api`
- `contents`
- `meta`
- `image_urls`

Extra MCP content:
- image content parts (`type: "image"`) up to 4

### `get_block_details`

Inputs:
- `id` (positive int, required)

Structured content keys:
- `block`
- `connections`
- `meta`
- `image_urls`

Extra MCP content:
- image content part (`type: "image"`) up to 1

### `get_block_connections`

Inputs:
- `id` (positive int, required)
- `page?` (int >= 1)
- `per?` (int 1..100)
- `sort?` (`created_at_desc|created_at_asc`)
- `filter?` (`ALL|OWN|EXCLUDE_OWN`)

Structured content keys:
- `channels`
- `meta`

### `get_user`

Inputs:
- `id_or_slug` (string, required)

Structured content keys:
- `user`
- `recent_contents`
- `meta`

### `get_user_contents`

Inputs:
- `id_or_slug` (string, required)
- `page?` (int >= 1)
- `per?` (int 1..100)
- `sort?` (`created_at_desc|created_at_asc|updated_at_desc|updated_at_asc`)
- `type?` (`Text|Image|Link|Attachment|Embed|Channel|Block`)

Structured content keys:
- `user`
- `contents`
- `meta`

## Write Tools

### `create_channel`

Inputs:
- `title` (string, required)
- `visibility?` (`public|private|closed`, default `closed`)
- `description?` (string)
- `group_id?` (positive int)

Structured content keys:
- `channel`
- `url`

### `create_block`

Inputs:
- `value` (string, required)
- `channel_ids` (positive int[], required, min 1, max 20)
- `title?` (string)
- `description?` (string)
- `original_source_url?` (URL string)
- `original_source_title?` (string)
- `alt_text?` (string)
- `insert_at?` (int >= 0)

Notes:
- local file paths are rejected; use public URLs or text
- write path is v3-only in current implementation

Structured content keys:
- `block`

### `connect_block`

Inputs:
- `block_id` (positive int, required)
- `channel_ids` (positive int[], required, min 1, max 20)
- `position?` (int >= 0)

Structured content keys:
- `connection`

### `disconnect_connection`

Inputs:
- `connection_id` (positive int, required)

Structured content keys:
- `connection_id`
- `disconnected` (`true`)

### `move_connection`

Inputs:
- `connection_id` (positive int, required)
- `movement` (`insert_at|move_to_top|move_to_bottom|move_up|move_down`, required)
- `position?` (int >= 0, required when `movement=insert_at`)

Structured content keys:
- `connection`

## Prompts

### `summarize_channel`

Args:
- `id_or_slug` (string, required)
- `focus?` (string)

Purpose:
- instructions for synthesizing channel themes across one or more pages

### `find_connections`

Args:
- `block_id` (positive int, required)
- `max_suggestions?` (int 1..10)

Purpose:
- instructions for proposing channel connection candidates

### `second_brain_synthesis`

Args:
- `topic` (string, required)
- `scope?` (`all|my|following`)

Purpose:
- instructions for multi-step search + retrieval synthesis with citations

## Response and Error Notes

- `401`: token/auth issue (check `ARENA_ACCESS_TOKEN`)
- `403`: permission issue (or premium-gated search if fallback disabled)
- `404`: resource not found
- `422`: validation error
- `429`: rate limit

For retry-safe behavior and limits, see:
- `src/arena/client.ts`
- `src/errors.ts`

## Quick Example Chains

### Search -> drill down top result

1) `search_arena(query="digital garden", type="Block", per=5)`
2) read `structuredContent.top_result_action`
3) call that action
4) if block, call `get_block_connections(id=top_result_id)`

### Deterministic write verification

1) `create_channel(...)`
2) read `structuredContent.channel.id` as `CH_ID`
3) `create_block(..., channel_ids=[CH_ID])`
4) read `structuredContent.block.id` as `BL_ID`
5) verify with `get_block_connections(id=BL_ID)` and `get_channel_contents(id_or_slug=String(CH_ID))`
