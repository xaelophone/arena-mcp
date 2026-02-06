import { clampPerPage, type ServerConfig } from "../config.js";
import { ArenaApiError, isRetryableStatus } from "../errors.js";
import {
  normalizeBlockFromV3,
  normalizeChannelFromV3,
  normalizeChannelListResponse,
  normalizeConnectableListResponse,
  normalizeSearchResponseV2,
  normalizeSearchResponseV3,
  normalizeUserFromV3,
} from "./normalize.js";
import type {
  BlockConnectionsParams,
  ChannelContentsParams,
  NormalizedBlock,
  NormalizedChannel,
  NormalizedSearchResult,
  NormalizedUser,
  PaginatedResult,
  SearchParams,
  UserContentsParams,
} from "./types.js";

interface RequestOptions {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  expectNoContent?: boolean;
}

interface ArenaClientDeps {
  fetchImpl?: typeof fetch;
  sleepMs?: (ms: number) => Promise<void>;
  random?: () => number;
}

interface NormalizedConnectionResult {
  id: number;
  connectableId: number | null;
  connectableType: string | null;
  channelId: number | null;
  createdAt: string | null;
  raw: unknown;
}

class ConcurrencyLimiter {
  private readonly max: number;
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(max: number) {
    this.max = max;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseRetryAfterSeconds(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const numeric = Number.parseFloat(headerValue);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric;
  }
  const unixTsMs = Date.parse(headerValue);
  if (Number.isNaN(unixTsMs)) {
    return null;
  }
  const deltaMs = unixTsMs - Date.now();
  return deltaMs > 0 ? deltaMs / 1000 : 0;
}

export function computeRetryDelayMs(params: {
  attempt: number;
  baseMs: number;
  retryAfterSeconds: number | null;
  random: () => number;
}): number {
  if (params.retryAfterSeconds !== null) {
    return Math.ceil(params.retryAfterSeconds * 1000);
  }
  const exponential = params.baseMs * 2 ** params.attempt;
  const jitter = Math.floor(params.random() * params.baseMs);
  return exponential + jitter;
}

function appendQuery(path: string, query: Record<string, unknown> | undefined): string {
  if (!query || Object.keys(query).length === 0) {
    return path;
  }

  const searchParams = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    if (Array.isArray(rawValue)) {
      if (rawValue.length === 0) {
        continue;
      }
      searchParams.set(key, rawValue.join(","));
      continue;
    }
    searchParams.set(key, String(rawValue));
  }
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function mapSearchTypeToV2Kind(type: SearchParams["type"]): string | undefined {
  if (!type || type === "All") {
    return undefined;
  }
  if (type === "Channel") {
    return "channels";
  }
  if (type === "User") {
    return "users";
  }
  if (type === "Group") {
    return undefined;
  }
  return "blocks";
}

export class ArenaClient {
  private readonly config: ServerConfig;
  private readonly limiter: ConcurrencyLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepMs: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(config: ServerConfig, deps: ArenaClientDeps = {}) {
    this.config = config;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.sleepMs = deps.sleepMs ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = deps.random ?? Math.random;
    this.limiter = new ConcurrencyLimiter(config.arenaMaxConcurrentRequests);
  }

  async getMe(): Promise<NormalizedUser> {
    const payload = await this.requestJson<unknown>("GET", "/v3/me");
    return normalizeUserFromV3(payload);
  }

  async getChannel(idOrSlug: string): Promise<NormalizedChannel> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/v3/channels/${encodeURIComponent(idOrSlug)}`,
    );
    return normalizeChannelFromV3(payload);
  }

  async getChannelContents(params: ChannelContentsParams): Promise<PaginatedResult<NormalizedBlock | NormalizedChannel>> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/v3/channels/${encodeURIComponent(params.idOrSlug)}/contents`,
      {
        query: {
          page: params.page ?? 1,
          per: clampPerPage(params.per ?? this.config.arenaDefaultPerPage),
          sort: params.sort ?? "created_at_desc",
          user_id: params.user_id,
        },
      },
    );
    return normalizeConnectableListResponse(payload);
  }

  async getBlock(id: number): Promise<NormalizedBlock> {
    const payload = await this.requestJson<unknown>("GET", `/v3/blocks/${id}`);
    return normalizeBlockFromV3(payload);
  }

  async getBlockConnections(
    params: BlockConnectionsParams,
  ): Promise<PaginatedResult<NormalizedChannel>> {
    const payload = await this.requestJson<unknown>("GET", `/v3/blocks/${params.id}/connections`, {
      query: {
        page: params.page ?? 1,
        per: clampPerPage(params.per ?? this.config.arenaDefaultPerPage),
        sort: params.sort ?? "created_at_desc",
        filter: params.filter ?? "ALL",
      },
    });
    return normalizeChannelListResponse(payload);
  }

  async getUser(idOrSlug: string): Promise<NormalizedUser> {
    const payload = await this.requestJson<unknown>("GET", `/v3/users/${encodeURIComponent(idOrSlug)}`);
    return normalizeUserFromV3(payload);
  }

  async getUserContents(params: UserContentsParams): Promise<PaginatedResult<NormalizedBlock | NormalizedChannel>> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/v3/users/${encodeURIComponent(params.idOrSlug)}/contents`,
      {
        query: {
          page: params.page ?? 1,
          per: clampPerPage(params.per ?? this.config.arenaDefaultPerPage),
          sort: params.sort ?? "created_at_desc",
          type: params.type,
        },
      },
    );
    return normalizeConnectableListResponse(payload);
  }

  async search(params: SearchParams): Promise<NormalizedSearchResult> {
    try {
      const payload = await this.searchV3(params);
      return normalizeSearchResponseV3(payload);
    } catch (error) {
      if (
        error instanceof ArenaApiError &&
        error.status === 403 &&
        this.config.arenaEnableV2SearchFallback
      ) {
        const fallbackPayload = await this.searchV2(params);
        return normalizeSearchResponseV2(fallbackPayload);
      }
      throw error;
    }
  }

  async searchV3(params: SearchParams): Promise<unknown> {
    return this.requestJson<unknown>("GET", "/v3/search", {
      query: {
        query: params.query,
        type: params.type,
        scope: params.scope,
        page: params.page ?? 1,
        per: clampPerPage(params.per ?? this.config.arenaDefaultPerPage),
        sort: params.sort,
        after: params.after,
        seed: params.seed,
        user_id: params.user_id,
        group_id: params.group_id,
        channel_id: params.channel_id,
        ext: params.ext,
      },
    });
  }

  async searchV2(params: SearchParams): Promise<unknown> {
    return this.requestJson<unknown>("GET", "/v2/search", {
      query: {
        q: params.query,
        page: params.page ?? 1,
        per: clampPerPage(params.per ?? this.config.arenaDefaultPerPage),
        kind: mapSearchTypeToV2Kind(params.type),
      },
    });
  }

  async createChannel(input: Record<string, unknown>): Promise<NormalizedChannel> {
    const payload = await this.requestJson<unknown>("POST", "/v3/channels", { body: input });
    return normalizeChannelFromV3(payload);
  }

  async createBlock(input: Record<string, unknown>): Promise<NormalizedBlock> {
    const payload = await this.requestJson<unknown>("POST", "/v3/blocks", { body: input });
    return normalizeBlockFromV3(payload);
  }

  async connectBlock(input: Record<string, unknown>): Promise<NormalizedConnectionResult> {
    const payload = await this.requestJson<unknown>("POST", "/v3/connections", { body: input });
    return this.normalizeConnectionResult(payload);
  }

  async disconnectConnection(connectionId: number): Promise<void> {
    await this.requestJson<unknown>("DELETE", `/v3/connections/${connectionId}`, {
      expectNoContent: true,
    });
  }

  async moveConnection(
    connectionId: number,
    payloadInput: Record<string, unknown>,
  ): Promise<NormalizedConnectionResult> {
    const payload = await this.requestJson<unknown>("POST", `/v3/connections/${connectionId}/move`, {
      body: payloadInput,
    });
    return this.normalizeConnectionResult(payload);
  }

  private normalizeConnectionResult(response: unknown): NormalizedConnectionResult {
    const record = toRecord(response);
    return {
      id: typeof record.id === "number" ? record.id : 0,
      connectableId: typeof record.connectable_id === "number" ? record.connectable_id : null,
      connectableType: typeof record.connectable_type === "string" ? record.connectable_type : null,
      channelId: typeof record.channel_id === "number" ? record.channel_id : null,
      createdAt: typeof record.created_at === "string" ? record.created_at : null,
      raw: response,
    };
  }

  private async requestJson<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.limiter.run(async () => {
      for (let attempt = 0; attempt <= this.config.arenaMaxRetries; ) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.arenaApiTimeoutMs);
        const relativePath = appendQuery(path, options.query);
        const url = `${this.config.arenaApiBaseUrl}${relativePath}`;

        try {
          const response = await this.fetchImpl(url, {
            method,
            headers: {
              Authorization: `Bearer ${this.config.arenaAccessToken}`,
              Accept: "application/json",
              ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
            },
            body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (options.expectNoContent && response.status === 204) {
            return undefined as T;
          }

          const contentType = response.headers.get("content-type") ?? "";
          let parsedBody: unknown = null;
          if (response.status !== 204) {
            if (contentType.includes("application/json")) {
              parsedBody = await response.json().catch(() => null);
            } else {
              parsedBody = await response.text().catch(() => null);
            }
          }

          if (!response.ok) {
            const retryAfter = parseRetryAfterSeconds(response.headers.get("retry-after"));
            const arenaError = new ArenaApiError({
              message: `Are.na API request failed with ${response.status}`,
              status: response.status,
              responseBody: parsedBody,
              retryAfterSeconds: retryAfter,
              url,
            });

            if (isRetryableStatus(response.status) && attempt < this.config.arenaMaxRetries) {
              const delay = computeRetryDelayMs({
                attempt,
                baseMs: this.config.arenaBackoffBaseMs,
                retryAfterSeconds: retryAfter,
                random: this.random,
              });
              attempt += 1;
              await this.sleepMs(delay);
              continue;
            }
            throw arenaError;
          }

          return parsedBody as T;
        } catch (error) {
          clearTimeout(timeout);
          if (error instanceof ArenaApiError) {
            throw error;
          }

          if (attempt >= this.config.arenaMaxRetries) {
            throw error;
          }
          const delay = computeRetryDelayMs({
            attempt,
            baseMs: this.config.arenaBackoffBaseMs,
            retryAfterSeconds: null,
            random: this.random,
          });
          attempt += 1;
          await this.sleepMs(delay);
        }
      }
      throw new Error("Request retry loop ended unexpectedly.");
    });
  }
}
