import { describe, expect, it, vi } from "vitest";
import { ArenaClient, computeRetryDelayMs } from "../src/arena/client.js";
import { ArenaApiError } from "../src/errors.js";
import type { ServerConfig } from "../src/config.js";

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    arenaAccessToken: "test-token",
    arenaApiBaseUrl: "https://api.are.na",
    arenaApiTimeoutMs: 15_000,
    arenaMaxRetries: 5,
    arenaBackoffBaseMs: 500,
    arenaMaxConcurrentRequests: 4,
    arenaDefaultPerPage: 50,
    arenaEnableV2SearchFallback: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
  });
}

describe("ArenaClient retries", () => {
  it("honors Retry-After on 429 responses", async () => {
    const sleepCalls: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, 429, { "retry-after": "1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 1,
          slug: "tester",
          name: "Tester",
          avatar: null,
          initials: "T",
          counts: { channels: 1 },
        }, 200),
      );

    const client = new ArenaClient(makeConfig({ arenaMaxRetries: 2 }), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepMs: async (ms) => {
        sleepCalls.push(ms);
      },
      random: () => 0,
    });

    const user = await client.getMe();

    expect(user.slug).toBe("tester");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toEqual([1000]);
  });

  it("stops retrying after max retries", async () => {
    const sleepCalls: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "server unavailable" }, 503));

    const client = new ArenaClient(makeConfig({ arenaMaxRetries: 2, arenaBackoffBaseMs: 100 }), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepMs: async (ms) => {
        sleepCalls.push(ms);
      },
      random: () => 0,
    });

    await expect(client.getMe()).rejects.toBeInstanceOf(ArenaApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([100, 200]);
  });

  it("computes exponential jitter delay when Retry-After is absent", () => {
    const delay = computeRetryDelayMs({
      attempt: 2,
      baseMs: 500,
      retryAfterSeconds: null,
      random: () => 0.5,
    });
    expect(delay).toBe(2250);
  });
});

describe("ArenaClient search fallback", () => {
  it("falls back from v3 search to v2 on premium 403", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes("/v3/search")) {
        return jsonResponse({ error: "premium required" }, 403);
      }
      return jsonResponse(
        {
          current_page: 1,
          total_pages: 1,
          length: 1,
          per: 24,
          blocks: [{ id: 7, title: "Fallback Block", class: "Text" }],
          channels: [],
          users: [],
        },
        200,
      );
    });

    const client = new ArenaClient(makeConfig(), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      random: () => 0,
      sleepMs: async () => undefined,
    });

    const result = await client.search({ query: "fallback test" });
    expect(result.sourceApi).toBe("v2-fallback");
    expect(result.items[0]?.id).toBe(7);
  });

  it("surfaces v3 search 403 when fallback is disabled", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "premium required" }, 403));

    const client = new ArenaClient(makeConfig({ arenaEnableV2SearchFallback: false }), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      random: () => 0,
      sleepMs: async () => undefined,
    });

    await expect(client.search({ query: "no-fallback" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("ArenaClient integration-style behavior", () => {
  it("normalizes channel contents with pagination metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            data: [
              {
                id: 100,
                type: "Text",
                title: "Example",
                content: { markdown: "hello", html: "<p>hello</p>", plain: "hello" },
              },
            ],
            meta: {
              current_page: 1,
              next_page: 2,
              prev_page: null,
              per_page: 50,
              total_pages: 2,
              total_count: 75,
              has_more_pages: true,
            },
          },
          200,
        ),
      );

    const client = new ArenaClient(makeConfig(), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepMs: async () => undefined,
      random: () => 0,
    });

    const response = await client.getChannelContents({ idOrSlug: "test-channel", page: 1 });
    expect(response.meta.currentPage).toBe(1);
    expect(response.meta.hasMorePages).toBe(true);
    expect(response.data[0]?.type).toBe("Text");
  });

  it("returns normalized block from create_block", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          id: 22,
          type: "Text",
          title: "Created",
          content: { markdown: "Body", html: "<p>Body</p>", plain: "Body" },
          source: null,
        },
        201,
      ),
    );

    const client = new ArenaClient(makeConfig(), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepMs: async () => undefined,
      random: () => 0,
    });

    const block = await client.createBlock({ value: "Body", channel_ids: [1] });
    expect(block.id).toBe(22);
    expect(block.type).toBe("Text");
  });

  it("surfaces v3 create_block 403 without fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Forbidden", details: { message: "Cannot add to this channel" } }, 403));

    const client = new ArenaClient(makeConfig(), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepMs: async () => undefined,
      random: () => 0,
    });

    await expect(
      client.createBlock({
        value: "https://mcp.so",
        channel_ids: [3167929],
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v3/blocks");
  });

  it("handles disconnect_connection with HTTP 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new ArenaClient(makeConfig(), {
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepMs: async () => undefined,
      random: () => 0,
    });

    await expect(client.disconnectConnection(33)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
