import type {
  NormalizedBlock,
  NormalizedChannel,
  NormalizedConnectable,
  NormalizedSearchItem,
  NormalizedSearchResult,
  NormalizedUser,
  PaginationMeta,
} from "../arena/types.js";

const DEFAULT_PREVIEW_LENGTH = 220;
const DEFAULT_IMAGE_PREVIEW_LIMIT = 4;

function truncate(value: string, max: number = DEFAULT_PREVIEW_LENGTH): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, max - 1))}…`;
}

function quoteIfNeeded(value: string): string {
  if (!value.includes("|")) {
    return value;
  }
  return value.replaceAll("|", "\\|");
}

export function buildPaginationFooter(meta: PaginationMeta, continuationHint: string): string {
  if (!meta.hasMorePages) {
    return "";
  }
  return [
    "",
    "---",
    `End of page ${meta.currentPage}.`,
    `${meta.totalCount} total items, ${Math.max(0, meta.totalCount - meta.currentPage * meta.perPage)} remaining.`,
    continuationHint,
  ].join("\n");
}

function renderBlockPreview(block: NormalizedBlock): string {
  if (block.type === "Text" && block.content?.markdown) {
    return truncate(block.content.markdown);
  }
  if ((block.type === "Link" || block.type === "Embed") && block.sourceUrl) {
    return block.sourceUrl;
  }
  if (block.type === "Image" && block.image?.src) {
    return block.image.src;
  }
  if (block.type === "Attachment" && block.attachment?.url) {
    return block.attachment.url;
  }
  if (block.description?.plain) {
    return truncate(block.description.plain);
  }
  return block.title ?? "";
}

export function formatConnectableLine(connectable: NormalizedConnectable): string {
  if (connectable.type === "Channel") {
    return `- [Channel] ${connectable.title} (slug: ${connectable.slug}, id: ${connectable.id})`;
  }
  return `- [${connectable.type}] ${connectable.title ?? `Block ${connectable.id}`} (id: ${connectable.id}) ${renderBlockPreview(connectable)}`;
}

export function formatChannelMarkdown(
  channel: NormalizedChannel,
  contents: NormalizedConnectable[],
  meta: PaginationMeta,
): string {
  const description = channel.description?.plain ?? "(no description)";
  const lines = [
    `# ${channel.title}`,
    "",
    `- id: ${channel.id}`,
    `- slug: ${channel.slug}`,
    `- visibility: ${channel.visibility ?? "unknown"}`,
    `- owner: ${channel.owner?.slug ?? "unknown"}`,
    `- total contents: ${channel.counts?.contents ?? "unknown"}`,
    "",
    `## Description`,
    description,
    "",
    `## Contents`,
    ...contents.map((item) => formatConnectableLine(item)),
  ];

  const imagePreviews = extractImagePreviewUrls(contents, DEFAULT_IMAGE_PREVIEW_LIMIT);
  if (imagePreviews.length > 0) {
    lines.push("", "## Image Previews");
    for (const preview of imagePreviews) {
      lines.push(`- ${preview.label}: ${preview.url}`);
      lines.push(`![${preview.label}](${preview.url})`);
    }
  }

  const footer = buildPaginationFooter(
    meta,
    `Use tool get_channel_contents(id_or_slug="${channel.slug}", page=${meta.currentPage + 1}) to continue.`,
  );
  if (footer) {
    lines.push(footer);
  }
  return lines.join("\n");
}

export function formatBlockMarkdown(block: NormalizedBlock, connections: NormalizedChannel[]): string {
  const lines = [
    `# ${block.title ?? `${block.type} ${block.id}`}`,
    "",
    `- id: ${block.id}`,
    `- type: ${block.type}`,
    `- visibility: ${block.visibility ?? "unknown"}`,
    `- source_url: ${block.sourceUrl ?? "none"}`,
    `- source_title: ${block.sourceTitle ?? "none"}`,
  ];

  if (block.type === "Text" && block.content?.markdown) {
    lines.push("", "## Content", block.content.markdown);
  } else if (block.type === "Image" && block.image) {
    lines.push("", "## Image");
    lines.push(`- src: ${block.image.src ?? "none"}`);
    lines.push(`- dimensions: ${block.image.width ?? "?"}x${block.image.height ?? "?"}`);
    lines.push(`- alt_text: ${block.image.altText ?? "none"}`);
    if (block.image.src) {
      lines.push(`![${block.title ?? `Image ${block.id}`}](${block.image.src})`);
    }
  } else if (block.type === "Attachment" && block.attachment) {
    lines.push("", "## Attachment");
    lines.push(`- url: ${block.attachment.url}`);
    lines.push(`- content_type: ${block.attachment.contentType ?? "unknown"}`);
  } else if (block.type === "Embed" && block.embed) {
    lines.push("", "## Embed");
    lines.push(`- source_url: ${block.embed.sourceUrl ?? "none"}`);
    lines.push(`- embed_url: ${block.embed.url ?? "none"}`);
  }

  lines.push("", "## Connected Channels");
  if (connections.length === 0) {
    lines.push("- none");
  } else {
    for (const channel of connections) {
      lines.push(`- ${channel.title} (slug: ${channel.slug}, id: ${channel.id})`);
    }
  }

  return lines.join("\n");
}

function extractImagePreviewUrls(
  contents: NormalizedConnectable[],
  limit: number,
): Array<{ label: string; url: string }> {
  const previews: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const item of contents) {
    if (item.type === "Channel" || item.type !== "Image" || !item.image?.src) {
      continue;
    }
    const url = item.image.src;
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    previews.push({
      label: item.title ?? `Image ${item.id}`,
      url,
    });
    if (previews.length >= limit) {
      break;
    }
  }
  return previews;
}

export function formatUserMarkdown(
  user: NormalizedUser,
  recentContents: NormalizedConnectable[],
  meta: PaginationMeta | null,
): string {
  const lines = [
    `# ${user.name} (@${user.slug})`,
    "",
    `- id: ${user.id}`,
    `- channels: ${user.counts?.channels ?? "unknown"}`,
    `- followers: ${user.counts?.followers ?? "unknown"}`,
    `- following: ${user.counts?.following ?? "unknown"}`,
  ];
  if (user.bio?.plain) {
    lines.push("", "## Bio", user.bio.plain);
  }
  lines.push("", "## Recent Contents");
  if (recentContents.length === 0) {
    lines.push("- none");
  } else {
    lines.push(...recentContents.map((item) => formatConnectableLine(item)));
  }
  if (meta) {
    const footer = buildPaginationFooter(
      meta,
      `Use tool get_user_contents(id_or_slug="${user.slug}", page=${meta.currentPage + 1}) to continue.`,
    );
    if (footer) {
      lines.push(footer);
    }
  }
  return lines.join("\n");
}

export function formatSearchResultsMarkdown(result: NormalizedSearchResult): string {
  const topResult = result.items[0] ?? null;
  const lines = [
    `# Search Results`,
    "",
    `- source_api: ${result.sourceApi}`,
    `- page: ${result.meta.currentPage}/${result.meta.totalPages}`,
    `- total_count: ${result.meta.totalCount}`,
    `- top_result_id: ${topResult?.id ?? "none"}`,
    `- top_result_type: ${topResult?.entityType ?? "none"}`,
    "",
    "| Type | ID | Title | Subtitle | Hint |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const item of result.items) {
    lines.push(
      `| ${quoteIfNeeded(item.entityType)} | ${item.id} | ${quoteIfNeeded(item.title)} | ${quoteIfNeeded(item.subtitle ?? "")} | ${quoteIfNeeded(formatSearchFollowUpHint(item))} |`,
    );
  }
  const footer = buildPaginationFooter(
    result.meta,
    `Use tool search_arena(query="<same query>", page=${result.meta.currentPage + 1}) to continue.`,
  );
  if (footer) {
    lines.push(footer);
  }
  return lines.join("\n");
}

function formatSearchFollowUpHint(item: NormalizedSearchItem): string {
  if (item.entityType === "Block") {
    return `get_block_details(id=${item.id}) + get_block_connections(id=${item.id})`;
  }
  if (item.entityType === "Channel") {
    const idOrSlug = item.slug ?? String(item.id);
    return `get_channel_contents(id_or_slug="${idOrSlug}")`;
  }
  if (item.entityType === "User") {
    const idOrSlug = item.slug ?? String(item.id);
    return `get_user(id_or_slug="${idOrSlug}")`;
  }
  return "No direct tool (refine search_arena)";
}
