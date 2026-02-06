import type {
  ConnectBlockInput,
  CreateBlockInput,
  CreateChannelInput,
  MoveConnectionInput,
} from "./types.js";

function assertChannelIds(channelIds: number[]): void {
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    throw new Error("channel_ids must contain at least one channel ID.");
  }
  if (channelIds.length > 20) {
    throw new Error("channel_ids cannot exceed 20 IDs.");
  }
}

export function looksLikeLocalFilePath(value: string): boolean {
  if (value.startsWith("file://")) {
    return true;
  }
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }
  return /^[A-Za-z]:\\/.test(value);
}

export function buildCreateChannelPayload(input: CreateChannelInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: input.title,
    visibility: input.visibility ?? "closed",
  };
  if (input.description !== undefined) {
    payload.description = input.description;
  }
  if (input.group_id !== undefined) {
    payload.group_id = input.group_id;
  }
  return payload;
}

export function buildCreateBlockPayload(input: CreateBlockInput): Record<string, unknown> {
  assertChannelIds(input.channel_ids);

  if (looksLikeLocalFilePath(input.value)) {
    throw new Error(
      "Local file uploads are not supported by this server. Provide a public URL in `value` instead.",
    );
  }

  const payload: Record<string, unknown> = {
    value: input.value,
    channel_ids: input.channel_ids,
  };

  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.original_source_url !== undefined) payload.original_source_url = input.original_source_url;
  if (input.original_source_title !== undefined) {
    payload.original_source_title = input.original_source_title;
  }
  if (input.alt_text !== undefined) payload.alt_text = input.alt_text;
  if (input.insert_at !== undefined) payload.insert_at = input.insert_at;

  return payload;
}

export function buildConnectBlockPayload(input: ConnectBlockInput): Record<string, unknown> {
  assertChannelIds(input.channel_ids);
  const payload: Record<string, unknown> = {
    connectable_id: input.block_id,
    connectable_type: "Block",
    channel_ids: input.channel_ids,
  };
  if (input.position !== undefined) {
    payload.position = input.position;
  }
  return payload;
}

export function buildMoveConnectionPayload(input: MoveConnectionInput): Record<string, unknown> {
  if (input.movement === "insert_at" && input.position === undefined) {
    throw new Error("position is required when movement is insert_at.");
  }
  const payload: Record<string, unknown> = {
    movement: input.movement,
  };
  if (input.position !== undefined) {
    payload.position = input.position;
  }
  return payload;
}
