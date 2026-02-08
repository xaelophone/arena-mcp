import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createArenaMcpServer } from "../src/server.js";
import type { ServerConfig } from "../src/config.js";
import type { NormalizedSearchItem } from "../src/arena/types.js";
import { ArenaApiError } from "../src/errors.js";

function makeConfig(): ServerConfig {
  return {
    arenaAccessToken: "token",
    arenaApiBaseUrl: "https://api.are.na",
    arenaApiTimeoutMs: 15_000,
    arenaMaxRetries: 2,
    arenaBackoffBaseMs: 100,
    arenaMaxConcurrentRequests: 4,
    arenaDefaultPerPage: 50,
    arenaEnableV2SearchFallback: true,
    arenaImageFetchTimeoutMs: 10_000,
    arenaImageFetchMaxBytes: 2_000_000,
    arenaImageFetchMaxConcurrent: 3,
    arenaImageFetchUserAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  };
}

function makeFakeArenaClient(searchItems: NormalizedSearchItem[] = []) {
  return {
    getMe: async () => ({
      id: 1,
      slug: "me",
      name: "Me",
      avatar: null,
      initials: "M",
      bio: null,
      createdAt: null,
      updatedAt: null,
      counts: null,
    }),
    getChannel: async () => ({
      type: "Channel" as const,
      id: 1,
      slug: "channel",
      title: "Channel",
      description: null,
      state: "available",
      visibility: "closed",
      createdAt: null,
      updatedAt: null,
      owner: null,
      counts: { blocks: 0, channels: 0, contents: 0, collaborators: 1 },
      connection: null,
    }),
    getChannelContents: async () => ({ data: [], meta: { currentPage: 1, nextPage: null, prevPage: null, perPage: 50, totalPages: 1, totalCount: 0, hasMorePages: false } }),
    getBlock: async () => ({
      type: "Text" as const,
      id: 1,
      title: "Block",
      description: null,
      state: "available",
      visibility: "public",
      commentCount: 0,
      createdAt: null,
      updatedAt: null,
      user: null,
      sourceUrl: null,
      sourceTitle: null,
      content: { markdown: "hello", html: "<p>hello</p>", plain: "hello" },
      image: null,
      attachment: null,
      embed: null,
      connection: null,
    }),
    getBlockConnections: async () => ({ data: [], meta: { currentPage: 1, nextPage: null, prevPage: null, perPage: 50, totalPages: 1, totalCount: 0, hasMorePages: false } }),
    getUser: async () => ({
      id: 1,
      slug: "user",
      name: "User",
      avatar: null,
      initials: "U",
      bio: null,
      createdAt: null,
      updatedAt: null,
      counts: null,
    }),
    getUserContents: async () => ({ data: [], meta: { currentPage: 1, nextPage: null, prevPage: null, perPage: 50, totalPages: 1, totalCount: 0, hasMorePages: false } }),
    search: async () => ({
      sourceApi: "v3" as const,
      items: searchItems,
      meta: {
        currentPage: 1,
        nextPage: null,
        prevPage: null,
        perPage: 50,
        totalPages: 1,
        totalCount: searchItems.length,
        hasMorePages: false,
      },
    }),
    createChannel: async () => ({
      type: "Channel" as const,
      id: 2,
      slug: "created",
      title: "Created",
      description: null,
      state: "available",
      visibility: "closed",
      createdAt: null,
      updatedAt: null,
      owner: null,
      counts: { blocks: 0, channels: 0, contents: 0, collaborators: 1 },
      connection: null,
    }),
    createBlock: async () => ({
      type: "Text" as const,
      id: 2,
      title: "Created",
      description: null,
      state: "available",
      visibility: "public",
      commentCount: 0,
      createdAt: null,
      updatedAt: null,
      user: null,
      sourceUrl: null,
      sourceTitle: null,
      content: { markdown: "created", html: "<p>created</p>", plain: "created" },
      image: null,
      attachment: null,
      embed: null,
      connection: null,
    }),
    connectBlock: async () => ({ id: 3, connectableId: 2, connectableType: "Block", channelId: 1, createdAt: null, raw: {} }),
    disconnectConnection: async () => undefined,
    moveConnection: async () => ({ id: 3, connectableId: 2, connectableType: "Block", channelId: 1, createdAt: null, raw: {} }),
  };
}

describe("MCP server smoke", () => {
  let client: Client | null = null;
  let serverClose: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
    if (serverClose) {
      await serverClose();
      serverClose = null;
    }
  });

  it("registers tools, resources, and prompts over transport", async () => {
    const fakeArenaClient = makeFakeArenaClient();
    const server = createArenaMcpServer(makeConfig(), {
      arenaClient: fakeArenaClient as never,
    });
    serverClose = () => server.close();

    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    const resources = await client.listResources();
    const prompts = await client.listPrompts();

    const toolNames = tools.tools.map((tool) => tool.name);
    const resourceNames = resources.resources.map((resource) => resource.name);
    const resourceUris = resources.resources.map((resource) => resource.uri);
    const promptNames = prompts.prompts.map((prompt) => prompt.name);

    expect(toolNames).toContain("search_arena");
    expect(toolNames).toContain("create_block");
    expect(resourceNames).toContain("arena-me");
    expect(resourceUris).toContain("arena://me");
    expect(promptNames).toContain("second_brain_synthesis");
  });

  it("returns top-result structured fields for search_arena", async () => {
    const fakeArenaClient = makeFakeArenaClient([
      {
        id: 42,
        entityType: "Block",
        title: "Astro Digital Garden",
        subtitle: "https://astro-digital-garden.example.com",
        slug: null,
        blockType: "Link",
        url: null,
        raw: {},
      },
    ]);
    const server = createArenaMcpServer(makeConfig(), {
      arenaClient: fakeArenaClient as never,
    });
    serverClose = () => server.close();

    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({
      name: "search_arena",
      arguments: { query: "digital garden" },
    });
    const structured = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
    expect(structured).toBeTruthy();
    expect(structured?.source_api).toBe("v3");
    expect(structured?.top_result_id).toBe(42);
    expect(structured?.top_result_type).toBe("Block");
    expect(structured?.top_result_action).toEqual({
      tool: "get_block_details",
      arguments: { id: 42 },
    });
    expect(structured?.top_result_connections_action).toEqual({
      tool: "get_block_connections",
      arguments: { id: 42 },
    });
    expect(structured?.raw_included).toBe(false);
  });

  it("uses per=10 by default and returns compact search items", async () => {
    const searchMock = vi.fn(async () => ({
      sourceApi: "v3" as const,
      items: [
        {
          id: 42,
          entityType: "Block" as const,
          title: "Astro Digital Garden",
          subtitle: "https://astro-digital-garden.example.com",
          slug: null,
          blockType: "Link" as const,
          url: null,
          raw: { large: "payload" },
        },
      ],
      meta: {
        currentPage: 1,
        nextPage: 2,
        prevPage: null,
        perPage: 10,
        totalPages: 2,
        totalCount: 11,
        hasMorePages: true,
      },
    }));
    const fakeArenaClient = {
      ...makeFakeArenaClient(),
      search: searchMock,
    };
    const server = createArenaMcpServer(makeConfig(), {
      arenaClient: fakeArenaClient as never,
    });
    serverClose = () => server.close();

    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({
      name: "search_arena",
      arguments: { query: "digital garden" },
    });
    expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ query: "digital garden", per: 10 }));

    const structured = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
    expect(structured).toBeTruthy();
    expect(structured?.raw_included).toBe(false);
    expect(structured?.returned_count).toBe(1);
    expect(structured?.next_page_action).toEqual({
      tool: "search_arena",
      arguments: {
        query: "digital garden",
        page: 2,
        per: 10,
      },
    });

    const items = structured?.items as Array<Record<string, unknown>> | undefined;
    expect(items?.length).toBeGreaterThan(0);
    const firstItem = items?.[0];
    expect(firstItem).toBeTruthy();
    if (!firstItem) {
      throw new Error("Expected at least one search result item");
    }
    expect("raw" in firstItem).toBe(false);
  });

  it("truncates oversized structured search output when include_raw=true", async () => {
    const rawBlob = { payload: "x".repeat(16_000) };
    const searchMock = vi.fn(async () => ({
      sourceApi: "v3" as const,
      items: [
        {
          id: 1,
          entityType: "Block" as const,
          title: "Result 1",
          subtitle: "https://example.com/1",
          slug: null,
          blockType: "Link" as const,
          url: null,
          raw: rawBlob,
        },
        {
          id: 2,
          entityType: "Block" as const,
          title: "Result 2",
          subtitle: "https://example.com/2",
          slug: null,
          blockType: "Link" as const,
          url: null,
          raw: rawBlob,
        },
      ],
      meta: {
        currentPage: 1,
        nextPage: null,
        prevPage: null,
        perPage: 2,
        totalPages: 1,
        totalCount: 2,
        hasMorePages: false,
      },
    }));
    const fakeArenaClient = {
      ...makeFakeArenaClient(),
      search: searchMock,
    };
    const server = createArenaMcpServer(makeConfig(), {
      arenaClient: fakeArenaClient as never,
    });
    serverClose = () => server.close();

    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({
      name: "search_arena",
      arguments: { query: "digital garden", per: 2, include_raw: true },
    });
    const structured = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
    expect(structured).toBeTruthy();
    expect(structured?.raw_included).toBe(true);
    expect(structured?.truncated).toBe(true);
    expect(structured?.truncation_reason).toBe("response_size_budget");
    expect(structured?.returned_count).toBe(1);
    expect(structured?.refine_hint).toContain("Reduce per");
  });

  it("resolves get_channel_contents input from Are.na URL", async () => {
    const getChannelMock = vi.fn(async (idOrSlug: string) => ({
      type: "Channel" as const,
      id: 3167904,
      slug: idOrSlug,
      title: "EGO",
      description: null,
      state: "available",
      visibility: "closed",
      createdAt: null,
      updatedAt: null,
      owner: {
        id: 1,
        slug: "example-owner",
        name: "Example Owner",
        avatar: null,
        initials: "SE",
      },
      counts: { blocks: 0, channels: 0, contents: 0, collaborators: 1 },
      connection: null,
    }));
    const getChannelContentsMock = vi.fn(async ({ idOrSlug }: { idOrSlug: string }) => ({
      data: [],
      meta: {
        currentPage: 1,
        nextPage: null,
        prevPage: null,
        perPage: 50,
        totalPages: 1,
        totalCount: 0,
        hasMorePages: false,
      },
      idOrSlug,
    }));

    const fakeArenaClient = {
      ...makeFakeArenaClient(),
      getChannel: getChannelMock,
      getChannelContents: getChannelContentsMock,
    };
    const server = createArenaMcpServer(makeConfig(), {
      arenaClient: fakeArenaClient as never,
    });
    serverClose = () => server.close();

    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({
      name: "get_channel_contents",
      arguments: {
        id_or_slug: "https://www.are.na/example-owner/ego-3xnidixovwo",
      },
    });
    const structured = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
    expect(getChannelMock).toHaveBeenCalledWith("ego-3xnidixovwo");
    expect(getChannelContentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ idOrSlug: "ego-3xnidixovwo" }),
    );
    expect(structured?.channel_resolution).toEqual({
      input: "https://www.are.na/example-owner/ego-3xnidixovwo",
      resolved_id_or_slug: "ego-3xnidixovwo",
      strategy: "url-extracted",
      expected_owner_slug: "example-owner",
      actual_owner_slug: "example-owner",
      search_source_api: null,
    });
  });

  it("falls back from title to channel search for get_channel_contents", async () => {
    const getChannelMock = vi.fn(async (idOrSlug: string) => {
      if (idOrSlug === "EGO") {
        throw new ArenaApiError({
          message: "Not found",
          status: 404,
          responseBody: { error: "not found" },
          url: "https://api.are.na/v3/channels/EGO",
        });
      }
      return {
        type: "Channel" as const,
        id: 3167904,
        slug: "ego-3xnidixovwo",
        title: "EGO",
        description: null,
        state: "available",
        visibility: "closed",
        createdAt: null,
        updatedAt: null,
        owner: {
          id: 1,
          slug: "example-owner",
          name: "Example Owner",
          avatar: null,
          initials: "SE",
        },
        counts: { blocks: 0, channels: 0, contents: 0, collaborators: 1 },
        connection: null,
      };
    });
    const getChannelContentsMock = vi.fn(async () => ({
      data: [],
      meta: {
        currentPage: 1,
        nextPage: null,
        prevPage: null,
        perPage: 50,
        totalPages: 1,
        totalCount: 0,
        hasMorePages: false,
      },
    }));
    const searchMock = vi.fn(async () => ({
      sourceApi: "v3" as const,
      items: [
        {
          id: 3167904,
          entityType: "Channel" as const,
          title: "EGO",
          subtitle: "channel/ego-3xnidixovwo",
          slug: "ego-3xnidixovwo",
          blockType: null,
          url: "https://www.are.na/example-owner/ego-3xnidixovwo",
          raw: {},
        },
      ],
      meta: {
        currentPage: 1,
        nextPage: null,
        prevPage: null,
        perPage: 10,
        totalPages: 1,
        totalCount: 1,
        hasMorePages: false,
      },
    }));

    const fakeArenaClient = {
      ...makeFakeArenaClient(),
      getChannel: getChannelMock,
      getChannelContents: getChannelContentsMock,
      search: searchMock,
    };
    const server = createArenaMcpServer(makeConfig(), {
      arenaClient: fakeArenaClient as never,
    });
    serverClose = () => server.close();

    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({
      name: "get_channel_contents",
      arguments: {
        id_or_slug: "EGO",
      },
    });
    const structured = (result as { structuredContent?: Record<string, unknown> }).structuredContent;

    expect(searchMock).toHaveBeenCalledWith({
      query: "EGO",
      type: "Channel",
      scope: "my",
      per: 10,
      sort: "score_desc",
    });
    expect(getChannelMock).toHaveBeenNthCalledWith(1, "EGO");
    expect(getChannelMock).toHaveBeenNthCalledWith(2, "ego-3xnidixovwo");
    expect(getChannelContentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ idOrSlug: "ego-3xnidixovwo" }),
    );
    expect(structured?.channel_resolution).toEqual({
      input: "EGO",
      resolved_id_or_slug: "ego-3xnidixovwo",
      strategy: "search-exact-title",
      expected_owner_slug: null,
      actual_owner_slug: "example-owner",
      search_source_api: "v3",
    });
  });

  it("rejects owner/slug input when owner does not match resolved channel", async () => {
    const getChannelMock = vi.fn(async () => ({
      type: "Channel" as const,
      id: 4229335,
      slug: "mcp-smoke-test-2026-02-06-vi3bf7d93a0",
      title: "MCP Smoke Test",
      description: null,
      state: "available",
      visibility: "closed",
      createdAt: null,
      updatedAt: null,
      owner: {
        id: 2,
        slug: "other-owner",
        name: "Wrong Owner",
        avatar: null,
        initials: "WO",
      },
      counts: { blocks: 0, channels: 0, contents: 0, collaborators: 1 },
      connection: null,
    }));

    const fakeArenaClient = {
      ...makeFakeArenaClient(),
      getChannel: getChannelMock,
    };
    const server = createArenaMcpServer(makeConfig(), {
      arenaClient: fakeArenaClient as never,
    });
    serverClose = () => server.close();

    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({
      name: "get_channel_contents",
      arguments: {
        id_or_slug: "example-owner/mcp-smoke-test-2026-02-06-vi3bf7d93a0",
      },
    });
    const typedResult = result as {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
    };

    expect(typedResult.isError).toBe(true);
    expect(typedResult.content?.[0]?.type).toBe("text");
    if (typedResult.content?.[0]?.type === "text") {
      expect(typedResult.content[0].text).toContain("Channel owner mismatch");
    }
  });

  it("enforces write scope when configured", async () => {
    const fakeArenaClient = makeFakeArenaClient();
    const server = createArenaMcpServer(makeConfig(), {
      arenaClient: fakeArenaClient as never,
      requireWriteScope: () => "Access denied for write operation.",
    });
    serverClose = () => server.close();

    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({
      name: "create_channel",
      arguments: { title: "Should Fail" },
    });
    const typedResult = result as {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
    };
    expect(typedResult.isError).toBe(true);
    expect(typedResult.content?.[0]?.type).toBe("text");
    if (typedResult.content?.[0]?.type === "text") {
      expect(typedResult.content[0].text).toContain("Access denied for write operation.");
    }
  });
});
