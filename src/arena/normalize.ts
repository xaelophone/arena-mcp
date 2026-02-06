import type {
  ArenaSourceApi,
  NormalizedAttachment,
  NormalizedBlock,
  NormalizedChannel,
  NormalizedChannelCounts,
  NormalizedConnectable,
  NormalizedConnectionContext,
  NormalizedEmbed,
  NormalizedEmbeddedUser,
  NormalizedImage,
  NormalizedMarkdown,
  NormalizedSearchItem,
  NormalizedSearchResult,
  NormalizedUser,
  PaginationMeta,
  PaginatedResult,
} from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeMarkdown(value: unknown): NormalizedMarkdown | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return {
      markdown: value,
      html: value,
      plain: value,
    };
  }
  const record = asRecord(value);
  const markdown = asString(record.markdown);
  const html = asString(record.html);
  const plain = asString(record.plain);
  if (!markdown && !html && !plain) {
    return null;
  }
  return {
    markdown: markdown ?? plain ?? html ?? "",
    html: html ?? markdown ?? plain ?? "",
    plain: plain ?? markdown ?? html ?? "",
  };
}

export function normalizePaginationMeta(value: unknown): PaginationMeta {
  const record = asRecord(value);
  const currentPage = asNumber(record.current_page) ?? 1;
  const perPage = asNumber(record.per_page) ?? 0;
  const totalPages = asNumber(record.total_pages) ?? 1;
  const totalCount = asNumber(record.total_count) ?? 0;
  const nextPage = asNumber(record.next_page);
  const prevPage = asNumber(record.prev_page);
  const hasMorePagesValue = asBoolean(record.has_more_pages);
  const hasMorePages = hasMorePagesValue ?? (nextPage !== null && nextPage > 0);

  return {
    currentPage,
    nextPage,
    prevPage,
    perPage,
    totalPages,
    totalCount,
    hasMorePages,
  };
}

function normalizeEmbeddedUser(value: unknown): NormalizedEmbeddedUser | null {
  const record = asRecord(value);
  const id = asNumber(record.id);
  const slug = asString(record.slug);
  const name = asString(record.name);

  if (id === null || slug === null || name === null) {
    return null;
  }

  return {
    id,
    slug,
    name,
    avatar: asString(record.avatar),
    initials: asString(record.initials),
  };
}

function normalizeConnectionContext(value: unknown): NormalizedConnectionContext | null {
  const record = asRecord(value);
  const id = asNumber(record.id);
  if (id === null) {
    return null;
  }
  return {
    id,
    position: asNumber(record.position),
    pinned: asBoolean(record.pinned),
    connectedAt: asString(record.connected_at),
    connectedBy: normalizeEmbeddedUser(record.connected_by),
  };
}

function normalizeImage(value: unknown): NormalizedImage | null {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return null;
  }
  const small = asRecord(record.small);
  const medium = asRecord(record.medium);
  const large = asRecord(record.large);
  const square = asRecord(record.square);
  return {
    src: asString(record.src),
    small: asString(small.url),
    medium: asString(medium.url),
    large: asString(large.url),
    square: asString(square.url),
    altText: asString(record.alt_text),
    width: asNumber(record.width),
    height: asNumber(record.height),
    contentType: asString(record.content_type),
    filename: asString(record.filename),
    fileSize: asNumber(record.file_size),
  };
}

function normalizeAttachment(value: unknown): NormalizedAttachment | null {
  const record = asRecord(value);
  const url = asString(record.url);
  if (url === null) {
    return null;
  }
  return {
    url,
    filename: asString(record.filename),
    contentType: asString(record.content_type),
    fileSize: asNumber(record.file_size),
    fileExtension: asString(record.file_extension),
  };
}

function normalizeEmbed(value: unknown): NormalizedEmbed | null {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return null;
  }
  return {
    url: asString(record.url),
    sourceUrl: asString(record.source_url),
    html: asString(record.html),
    title: asString(record.title),
    type: asString(record.type),
    authorName: asString(record.author_name),
  };
}

function normalizeChannelCounts(value: unknown): NormalizedChannelCounts | null {
  const record = asRecord(value);
  const blocks = asNumber(record.blocks);
  const channels = asNumber(record.channels);
  const contents = asNumber(record.contents);
  const collaborators = asNumber(record.collaborators);
  if (blocks === null || channels === null || contents === null || collaborators === null) {
    return null;
  }
  return {
    blocks,
    channels,
    contents,
    collaborators,
  };
}

export function normalizeChannelFromV3(value: unknown): NormalizedChannel {
  const record = asRecord(value);
  const id = asNumber(record.id) ?? 0;
  const slug = asString(record.slug) ?? String(id);
  return {
    type: "Channel",
    id,
    slug,
    title: asString(record.title) ?? `Channel ${id}`,
    description: normalizeMarkdown(record.description),
    state: asString(record.state),
    visibility: asString(record.visibility),
    createdAt: asString(record.created_at),
    updatedAt: asString(record.updated_at),
    owner: normalizeEmbeddedUser(record.owner),
    counts: normalizeChannelCounts(record.counts),
    connection: normalizeConnectionContext(record.connection),
  };
}

export function normalizeBlockFromV3(value: unknown): NormalizedBlock {
  const record = asRecord(value);
  const id = asNumber(record.id) ?? 0;
  const typeRaw = asString(record.type) ?? "PendingBlock";
  const type = (
    ["Text", "Image", "Link", "Attachment", "Embed", "PendingBlock"].includes(typeRaw)
      ? typeRaw
      : "PendingBlock"
  ) as NormalizedBlock["type"];
  const source = asRecord(record.source);

  return {
    type,
    id,
    title: asString(record.title),
    description: normalizeMarkdown(record.description),
    state: asString(record.state),
    visibility: asString(record.visibility),
    commentCount: asNumber(record.comment_count),
    createdAt: asString(record.created_at),
    updatedAt: asString(record.updated_at),
    user: normalizeEmbeddedUser(record.user),
    sourceUrl: asString(source.url),
    sourceTitle: asString(source.title),
    content: normalizeMarkdown(record.content),
    image: normalizeImage(record.image),
    attachment: normalizeAttachment(record.attachment),
    embed: normalizeEmbed(record.embed),
    connection: normalizeConnectionContext(record.connection),
  };
}

export function normalizeConnectableFromV3(value: unknown): NormalizedConnectable {
  const record = asRecord(value);
  const type = asString(record.type);
  if (type === "Channel") {
    return normalizeChannelFromV3(record);
  }
  return normalizeBlockFromV3(record);
}

export function normalizeUserFromV3(value: unknown): NormalizedUser {
  const record = asRecord(value);
  const counts = asRecord(record.counts);
  const normalizedCounts = {
    channels: asNumber(counts.channels) ?? undefined,
    following: asNumber(counts.following) ?? undefined,
    followers: asNumber(counts.followers) ?? undefined,
    blocks: asNumber(counts.blocks) ?? undefined,
  };
  const hasAnyCounts = Object.values(normalizedCounts).some((count) => count !== undefined);
  return {
    id: asNumber(record.id) ?? 0,
    slug: asString(record.slug) ?? "",
    name: asString(record.name) ?? "",
    avatar: asString(record.avatar),
    initials: asString(record.initials),
    bio: normalizeMarkdown(record.bio),
    createdAt: asString(record.created_at),
    updatedAt: asString(record.updated_at),
    counts: hasAnyCounts ? normalizedCounts : null,
  };
}

export function normalizeConnectableListResponse(response: unknown): PaginatedResult<NormalizedConnectable> {
  const record = asRecord(response);
  return {
    data: asArray(record.data).map((item) => normalizeConnectableFromV3(item)),
    meta: normalizePaginationMeta(record.meta),
  };
}

export function normalizeChannelListResponse(response: unknown): PaginatedResult<NormalizedChannel> {
  const record = asRecord(response);
  return {
    data: asArray(record.data).map((item) => normalizeChannelFromV3(item)),
    meta: normalizePaginationMeta(record.meta),
  };
}

function inferUrl(entityType: NormalizedSearchItem["entityType"], slug: string | null): string | null {
  if (!slug) {
    return null;
  }
  if (entityType === "Channel") {
    return `https://www.are.na/channel/${slug}`;
  }
  if (entityType === "User") {
    return `https://www.are.na/${slug}`;
  }
  if (entityType === "Group") {
    return `https://www.are.na/group/${slug}`;
  }
  return null;
}

function normalizeSearchItemFromV3(value: unknown): NormalizedSearchItem {
  const record = asRecord(value);
  const type = asString(record.type);
  const id = asNumber(record.id) ?? 0;
  if (type === "Channel") {
    const slug = asString(record.slug);
    const title = asString(record.title) ?? `Channel ${id}`;
    return {
      id,
      entityType: "Channel",
      title,
      subtitle: slug ? `channel/${slug}` : null,
      slug,
      blockType: null,
      url: inferUrl("Channel", slug),
      raw: value,
    };
  }
  if (type === "User") {
    const slug = asString(record.slug);
    const title = asString(record.name) ?? `User ${id}`;
    return {
      id,
      entityType: "User",
      title,
      subtitle: slug ? `@${slug}` : null,
      slug,
      blockType: null,
      url: inferUrl("User", slug),
      raw: value,
    };
  }
  if (type === "Group") {
    const slug = asString(record.slug);
    const title = asString(record.name) ?? `Group ${id}`;
    return {
      id,
      entityType: "Group",
      title,
      subtitle: slug ? `group/${slug}` : null,
      slug,
      blockType: null,
      url: inferUrl("Group", slug),
      raw: value,
    };
  }
  const blockTypeRaw = asString(record.type) ?? "PendingBlock";
  const blockType = (
    ["Text", "Image", "Link", "Attachment", "Embed", "PendingBlock"].includes(blockTypeRaw)
      ? blockTypeRaw
      : "PendingBlock"
  ) as NormalizedSearchItem["blockType"];
  const title = asString(record.title) ?? `${blockType} block ${id}`;
  const source = asRecord(record.source);
  return {
    id,
    entityType: "Block",
    title,
    subtitle: asString(source.url),
    slug: null,
    blockType,
    url: null,
    raw: value,
  };
}

export function normalizeSearchResponseV3(response: unknown): NormalizedSearchResult {
  const record = asRecord(response);
  return {
    sourceApi: "v3",
    items: asArray(record.data).map((item) => normalizeSearchItemFromV3(item)),
    meta: normalizePaginationMeta(record.meta),
  };
}

function normalizeSearchItemFromV2(entityType: NormalizedSearchItem["entityType"], value: unknown) {
  const record = asRecord(value);
  const id = asNumber(record.id) ?? 0;
  const slug = asString(record.slug);

  if (entityType === "Channel") {
    const title = asString(record.title) ?? `Channel ${id}`;
    return {
      id,
      entityType,
      title,
      subtitle: slug ? `channel/${slug}` : null,
      slug,
      blockType: null,
      url: inferUrl("Channel", slug),
      raw: value,
    } as NormalizedSearchItem;
  }

  if (entityType === "User") {
    const title = asString(record.full_name) ?? asString(record.username) ?? `User ${id}`;
    return {
      id,
      entityType,
      title,
      subtitle: slug ? `@${slug}` : null,
      slug,
      blockType: null,
      url: inferUrl("User", slug),
      raw: value,
    } as NormalizedSearchItem;
  }

  const blockClass = asString(record.class) ?? "PendingBlock";
  const blockType = (
    ["Text", "Image", "Link", "Attachment", "Embed", "PendingBlock"].includes(blockClass)
      ? blockClass
      : "PendingBlock"
  ) as NormalizedSearchItem["blockType"];
  const title = asString(record.title) ?? `${blockType} block ${id}`;
  const source = asRecord(record.source);
  return {
    id,
    entityType: "Block",
    title,
    subtitle: asString(source.url),
    slug: null,
    blockType,
    url: null,
    raw: value,
  } as NormalizedSearchItem;
}

export function normalizeSearchResponseV2(response: unknown): NormalizedSearchResult {
  const record = asRecord(response);
  const per = asNumber(record.per) ?? 24;
  const currentPage = asNumber(record.current_page) ?? 1;
  const totalPages = asNumber(record.total_pages) ?? 1;
  const length = asNumber(record.length) ?? 0;

  const blockItems = asArray(record.blocks).map((item) => normalizeSearchItemFromV2("Block", item));
  const channelItems = asArray(record.channels).map((item) =>
    normalizeSearchItemFromV2("Channel", item),
  );
  const userItems = asArray(record.users).map((item) => normalizeSearchItemFromV2("User", item));

  return {
    sourceApi: "v2-fallback" as ArenaSourceApi,
    items: [...blockItems, ...channelItems, ...userItems],
    meta: {
      currentPage,
      nextPage: currentPage < totalPages ? currentPage + 1 : null,
      prevPage: currentPage > 1 ? currentPage - 1 : null,
      perPage: per,
      totalPages,
      totalCount: length,
      hasMorePages: currentPage < totalPages,
    },
  };
}
