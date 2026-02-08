import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArenaClient } from "../arena/client.js";
import {
  CHANNEL_CONTENT_SORT_VALUES,
  CONNECTION_FILTER_VALUES,
  CONNECTION_SORT_VALUES,
  CONTENT_SORT_VALUES,
  CONTENT_TYPE_FILTER_VALUES,
  type NormalizedChannel,
  type NormalizedSearchItem,
  SEARCH_SCOPE_VALUES,
  SEARCH_SORT_VALUES,
  SEARCH_TYPE_VALUES,
} from "../arena/types.js";
import { isArenaApiError, toUserFacingError } from "../errors.js";
import {
  formatBlockMarkdown,
  formatChannelMarkdown,
  formatSearchResultsMarkdown,
  formatUserMarkdown,
} from "../format/markdown.js";
import { buildImageContent, extractImageUrlsFromBlock, extractImageUrlsFromConnectables } from "./images.js";
import { toolError, toolSuccess } from "./tool-utils.js";

interface ReadToolDeps {
  arenaClient: ArenaClient;
  searchFallbackEnabled: boolean;
}

const positiveInteger = z.number().int().positive();
const pageSchema = z.number().int().min(1).optional();
const perSchema = z.number().int().min(1).max(100).optional();
const SEARCH_DEFAULT_PER = 10;
const SEARCH_STRUCTURED_MAX_BYTES = 24_000;

type StructuredSearchItem = Omit<NormalizedSearchItem, "raw"> & { raw?: unknown };

export function registerReadTools(server: McpServer, deps: ReadToolDeps): void {
  const { arenaClient, searchFallbackEnabled } = deps;

  server.registerTool(
    "search_arena",
    {
      title: "Search Are.na",
      description:
        "Search Are.na and return normalized results. Uses v3 and falls back to v2 when v3 is premium-gated.",
      inputSchema: {
        query: z.string().min(1),
        type: z.enum(SEARCH_TYPE_VALUES).optional(),
        scope: z.enum(SEARCH_SCOPE_VALUES).optional(),
        page: pageSchema,
        per: perSchema,
        sort: z.enum(SEARCH_SORT_VALUES).optional(),
        after: z.string().optional(),
        seed: positiveInteger.optional(),
        user_id: positiveInteger.optional(),
        group_id: positiveInteger.optional(),
        channel_id: positiveInteger.optional(),
        ext: z.array(z.string()).optional(),
        include_raw: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        const { include_raw: includeRawArg, ...searchArgs } = args;
        const includeRaw = includeRawArg === true;
        const requestedPer = searchArgs.per ?? SEARCH_DEFAULT_PER;
        const result = await arenaClient.search({
          ...searchArgs,
          per: requestedPer,
        });
        const compactItems = result.items.map((item) => toStructuredSearchItem(item, includeRaw));
        const fit = fitSearchItemsToBudget({
          items: compactItems,
          maxBytes: SEARCH_STRUCTURED_MAX_BYTES,
        });
        const visibleItems = result.items.slice(0, fit.items.length);
        const topResult = fit.items[0] ?? null;
        const topResultAction = visibleItems[0] ? buildPrimaryFollowUpAction(visibleItems[0]) : null;
        const topResultConnectionsAction =
          visibleItems[0]?.entityType === "Block"
            ? {
                tool: "get_block_connections",
                arguments: { id: visibleItems[0].id },
              }
            : null;
        const nextPageAction = result.meta.hasMorePages
          ? {
              tool: "search_arena",
              arguments: buildNextPageSearchArgs(searchArgs, requestedPer, includeRaw),
            }
          : null;
        const textResult = fit.truncated
          ? {
              ...result,
              items: visibleItems,
            }
          : result;
        const text = [
          formatSearchResultsMarkdown(textResult),
          fit.truncated
            ? `\nResponse trimmed to ${fit.items.length} item(s) to stay within response-size limits. Use page/per/type filters to narrow further.`
            : "",
        ].join("");

        return toolSuccess(text, {
          source_api: result.sourceApi,
          meta: result.meta,
          items: fit.items,
          returned_count: fit.items.length,
          truncated: fit.truncated,
          truncation_reason: fit.truncated ? "response_size_budget" : null,
          raw_included: includeRaw,
          top_result: topResult,
          top_result_id: topResult?.id ?? null,
          top_result_type: topResult?.entityType ?? null,
          top_result_title: topResult?.title ?? null,
          top_result_action: topResultAction,
          top_result_connections_action: topResultConnectionsAction,
          next_page_action: nextPageAction,
          refine_hint: fit.truncated
            ? "Reduce per, set type, or paginate with next_page_action to avoid oversized responses."
            : null,
        });
      } catch (error) {
        return toolError(
          toUserFacingError(error, {
            operation: "search_arena",
            searchFallbackEnabled,
          }),
        );
      }
    },
  );

  server.registerTool(
    "get_channel_contents",
    {
      title: "Get Channel Contents",
      description: "Read a channel and one page of contents.",
      inputSchema: {
        id_or_slug: z.string().min(1),
        page: pageSchema,
        per: perSchema,
        sort: z.enum(CHANNEL_CONTENT_SORT_VALUES).optional(),
        user_id: positiveInteger.optional(),
      },
    },
    async (args) => {
      try {
        const resolution = await resolveChannelFromInput(arenaClient, args.id_or_slug);
        const result = await arenaClient.getChannelContents({
          idOrSlug: resolution.idOrSlug,
          page: args.page,
          per: args.per,
          sort: args.sort,
          user_id: args.user_id,
        });
        const imageUrls = extractImageUrlsFromConnectables(result.data, 4);
        const imageContent = await buildImageContent(imageUrls, { maxImages: 4 });
        return toolSuccess(formatChannelMarkdown(resolution.channel, result.data, result.meta), {
          channel: resolution.channel,
          channel_resolution: {
            input: args.id_or_slug,
            resolved_id_or_slug: resolution.idOrSlug,
            strategy: resolution.strategy,
            expected_owner_slug: resolution.expectedOwnerSlug,
            actual_owner_slug: resolution.channel.owner?.slug ?? null,
            search_source_api: resolution.searchSourceApi ?? null,
          },
          contents: result.data,
          meta: result.meta,
          image_urls: imageUrls,
        }, imageContent);
      } catch (error) {
        return toolError(
          toUserFacingError(error, { operation: "get_channel_contents", target: args.id_or_slug }),
        );
      }
    },
  );

  server.registerTool(
    "get_block_details",
    {
      title: "Get Block Details",
      description: "Read complete metadata for a block plus connected channels.",
      inputSchema: {
        id: positiveInteger,
      },
    },
    async (args) => {
      try {
        const block = await arenaClient.getBlock(args.id);
        const connections = await arenaClient.getBlockConnections({ id: args.id, page: 1 });
        const imageUrls = extractImageUrlsFromBlock(block, 1);
        const imageContent = await buildImageContent(imageUrls, { maxImages: 1 });
        return toolSuccess(formatBlockMarkdown(block, connections.data), {
          block,
          connections: connections.data,
          meta: connections.meta,
          image_urls: imageUrls,
        }, imageContent);
      } catch (error) {
        return toolError(toUserFacingError(error, { operation: "get_block_details", target: args.id }));
      }
    },
  );

  server.registerTool(
    "get_block_connections",
    {
      title: "Get Block Connections",
      description: "List channels where a block appears.",
      inputSchema: {
        id: positiveInteger,
        page: pageSchema,
        per: perSchema,
        sort: z.enum(CONNECTION_SORT_VALUES).optional(),
        filter: z.enum(CONNECTION_FILTER_VALUES).optional(),
      },
    },
    async (args) => {
      try {
        const result = await arenaClient.getBlockConnections({
          id: args.id,
          page: args.page,
          per: args.per,
          sort: args.sort,
          filter: args.filter,
        });
        const text = [
          `Block ${args.id} appears in ${result.meta.totalCount} channels.`,
          ...result.data.map((channel) => `- ${channel.title} (slug: ${channel.slug}, id: ${channel.id})`),
        ].join("\n");
        return toolSuccess(text, {
          channels: result.data,
          meta: result.meta,
        });
      } catch (error) {
        return toolError(
          toUserFacingError(error, { operation: "get_block_connections", target: args.id }),
        );
      }
    },
  );

  server.registerTool(
    "get_user",
    {
      title: "Get User",
      description: "Read user profile details.",
      inputSchema: {
        id_or_slug: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const user = await arenaClient.getUser(args.id_or_slug);
        const contents = await arenaClient.getUserContents({ idOrSlug: args.id_or_slug, page: 1 });
        return toolSuccess(formatUserMarkdown(user, contents.data, contents.meta), {
          user,
          recent_contents: contents.data,
          meta: contents.meta,
        });
      } catch (error) {
        return toolError(toUserFacingError(error, { operation: "get_user", target: args.id_or_slug }));
      }
    },
  );

  server.registerTool(
    "get_user_contents",
    {
      title: "Get User Contents",
      description: "List one page of user content.",
      inputSchema: {
        id_or_slug: z.string().min(1),
        page: pageSchema,
        per: perSchema,
        sort: z.enum(CONTENT_SORT_VALUES).optional(),
        type: z.enum(CONTENT_TYPE_FILTER_VALUES).optional(),
      },
    },
    async (args) => {
      try {
        const user = await arenaClient.getUser(args.id_or_slug);
        const result = await arenaClient.getUserContents({
          idOrSlug: args.id_or_slug,
          page: args.page,
          per: args.per,
          sort: args.sort,
          type: args.type,
        });
        return toolSuccess(formatUserMarkdown(user, result.data, result.meta), {
          user,
          contents: result.data,
          meta: result.meta,
        });
      } catch (error) {
        return toolError(
          toUserFacingError(error, { operation: "get_user_contents", target: args.id_or_slug }),
        );
      }
    },
  );
}

function buildPrimaryFollowUpAction(item: NormalizedSearchItem): Record<string, unknown> | null {
  if (item.entityType === "Block") {
    return {
      tool: "get_block_details",
      arguments: { id: item.id },
    };
  }
  if (item.entityType === "Channel") {
    return {
      tool: "get_channel_contents",
      arguments: { id_or_slug: item.slug ?? String(item.id) },
    };
  }
  if (item.entityType === "User") {
    return {
      tool: "get_user",
      arguments: { id_or_slug: item.slug ?? String(item.id) },
    };
  }
  return null;
}

function toStructuredSearchItem(item: NormalizedSearchItem, includeRaw: boolean): StructuredSearchItem {
  const compact: StructuredSearchItem = {
    id: item.id,
    entityType: item.entityType,
    title: item.title,
    subtitle: item.subtitle,
    slug: item.slug,
    blockType: item.blockType,
    url: item.url,
  };
  if (includeRaw) {
    compact.raw = item.raw;
  }
  return compact;
}

function fitSearchItemsToBudget(params: {
  items: StructuredSearchItem[];
  maxBytes: number;
}): {
  items: StructuredSearchItem[];
  truncated: boolean;
} {
  let items = [...params.items];
  let truncated = false;
  while (items.length > 0) {
    const bytes = Buffer.byteLength(JSON.stringify({ items }), "utf8");
    if (bytes <= params.maxBytes) {
      break;
    }
    items = items.slice(0, -1);
    truncated = true;
  }
  if (items.length < params.items.length) {
    truncated = true;
  }
  return { items, truncated };
}

function buildNextPageSearchArgs(
  args: Record<string, unknown>,
  per: number,
  includeRaw: boolean,
): Record<string, unknown> {
  const currentPage = typeof args.page === "number" && Number.isFinite(args.page) ? args.page : 1;
  const next = {
    query: args.query,
    type: args.type,
    scope: args.scope,
    page: currentPage + 1,
    per,
    sort: args.sort,
    after: args.after,
    seed: args.seed,
    user_id: args.user_id,
    group_id: args.group_id,
    channel_id: args.channel_id,
    ext: args.ext,
    include_raw: includeRaw ? true : undefined,
  };
  return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
}

interface ResolvedChannel {
  channel: NormalizedChannel;
  idOrSlug: string;
  strategy: "direct" | "url-extracted" | "search-exact-slug" | "search-exact-title" | "search-single";
  searchSourceApi?: "v3" | "v2-fallback";
  expectedOwnerSlug: string | null;
}

function normalizeChannelInput(input: string): {
  normalized: string;
  usedUrlExtraction: boolean;
  expectedOwnerSlug: string | null;
} {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { normalized: trimmed, usedUrlExtraction: false, expectedOwnerSlug: null };
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host !== "are.na" && host !== "www.are.na") {
      return normalizeOwnerSlugInput(trimmed);
    }
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      return normalizeOwnerSlugInput(trimmed);
    }
    if (segments[0] === "channel" && segments.length >= 2) {
      return {
        normalized: decodeURIComponent(segments[1] ?? trimmed),
        usedUrlExtraction: true,
        expectedOwnerSlug: null,
      };
    }
    if (segments[0] === "block") {
      return normalizeOwnerSlugInput(trimmed);
    }
    if (segments.length >= 2) {
      return {
        normalized: decodeURIComponent(segments[1] ?? trimmed),
        usedUrlExtraction: true,
        expectedOwnerSlug: decodeURIComponent(segments[0] ?? "").toLowerCase() || null,
      };
    }
    return {
      normalized: decodeURIComponent(segments[0] ?? trimmed),
      usedUrlExtraction: true,
      expectedOwnerSlug: null,
    };
  } catch {
    return normalizeOwnerSlugInput(trimmed);
  }
}

function normalizeOwnerSlugInput(input: string): {
  normalized: string;
  usedUrlExtraction: boolean;
  expectedOwnerSlug: string | null;
} {
  const trimmed = input.trim();
  const segments = trimmed
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length >= 2) {
    return {
      normalized: segments[1] ?? trimmed,
      usedUrlExtraction: false,
      expectedOwnerSlug: (segments[0] ?? "").toLowerCase() || null,
    };
  }

  return {
    normalized: trimmed,
    usedUrlExtraction: false,
    expectedOwnerSlug: null,
  };
}

function assertChannelOwnerMatch(
  channel: NormalizedChannel,
  expectedOwnerSlug: string | null,
  rawInput: string,
): void {
  if (!expectedOwnerSlug) {
    return;
  }
  const actualOwnerSlug = channel.owner?.slug?.toLowerCase() ?? null;
  if (!actualOwnerSlug) {
    throw new Error(
      `Channel owner verification failed for "${rawInput}". Expected owner "${expectedOwnerSlug}", but the API did not return an owner slug.`,
    );
  }
  if (actualOwnerSlug !== expectedOwnerSlug) {
    throw new Error(
      `Channel owner mismatch for "${rawInput}". Expected owner "${expectedOwnerSlug}" but got "${actualOwnerSlug}".`,
    );
  }
}

async function resolveChannelFromInput(
  arenaClient: ArenaClient,
  rawInput: string,
): Promise<ResolvedChannel> {
  const { normalized, usedUrlExtraction, expectedOwnerSlug } = normalizeChannelInput(rawInput);
  const preferredIdOrSlug = normalized;

  try {
    const channel = await arenaClient.getChannel(preferredIdOrSlug);
    assertChannelOwnerMatch(channel, expectedOwnerSlug, rawInput);
    return {
      channel,
      idOrSlug: preferredIdOrSlug,
      strategy: usedUrlExtraction ? "url-extracted" : "direct",
      expectedOwnerSlug,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Channel owner mismatch")) {
      throw error;
    }
    if (error instanceof Error && error.message.includes("Channel owner verification failed")) {
      throw error;
    }
    if (!(isArenaApiError(error) && error.status === 404)) {
      throw error;
    }

    const searchResult = await arenaClient.search({
      query: rawInput.trim(),
      type: "Channel",
      scope: "my",
      per: 10,
      sort: "score_desc",
    });
    const channelCandidates = searchResult.items.filter(
      (item): item is NormalizedSearchItem & { entityType: "Channel" } => item.entityType === "Channel",
    );

    const inputLower = rawInput.trim().toLowerCase();
    const normalizedLower = normalized.toLowerCase();

    const exactSlugMatches = channelCandidates.filter(
      (item) => item.slug !== null && item.slug.toLowerCase() === normalizedLower,
    );
    const [selectedBySlug] = exactSlugMatches;
    if (exactSlugMatches.length === 1 && selectedBySlug) {
      const selected = selectedBySlug;
      const idOrSlug = selected.slug ?? String(selected.id);
      const channel = await arenaClient.getChannel(idOrSlug);
      assertChannelOwnerMatch(channel, expectedOwnerSlug, rawInput);
      return {
        channel,
        idOrSlug,
        strategy: "search-exact-slug",
        searchSourceApi: searchResult.sourceApi,
        expectedOwnerSlug,
      };
    }

    const exactTitleMatches = channelCandidates.filter(
      (item) => item.title.trim().toLowerCase() === inputLower,
    );
    const [selectedByTitle] = exactTitleMatches;
    if (exactTitleMatches.length === 1 && selectedByTitle) {
      const selected = selectedByTitle;
      const idOrSlug = selected.slug ?? String(selected.id);
      const channel = await arenaClient.getChannel(idOrSlug);
      assertChannelOwnerMatch(channel, expectedOwnerSlug, rawInput);
      return {
        channel,
        idOrSlug,
        strategy: "search-exact-title",
        searchSourceApi: searchResult.sourceApi,
        expectedOwnerSlug,
      };
    }

    const [singleCandidate] = channelCandidates;
    if (channelCandidates.length === 1 && singleCandidate) {
      const selected = singleCandidate;
      const idOrSlug = selected.slug ?? String(selected.id);
      const channel = await arenaClient.getChannel(idOrSlug);
      assertChannelOwnerMatch(channel, expectedOwnerSlug, rawInput);
      return {
        channel,
        idOrSlug,
        strategy: "search-single",
        searchSourceApi: searchResult.sourceApi,
        expectedOwnerSlug,
      };
    }

    if (channelCandidates.length > 1) {
      const choices = channelCandidates
        .slice(0, 5)
        .map((item) => `${item.title} (slug: ${item.slug ?? "none"}, id: ${item.id})`)
        .join("; ");
      throw new Error(
        `Channel "${rawInput}" is ambiguous. Use an exact slug/id. Candidates: ${choices}`,
      );
    }

    throw error;
  }
}
