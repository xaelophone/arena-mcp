export interface ServerConfig {
  arenaAccessToken: string;
  arenaApiBaseUrl: string;
  arenaApiTimeoutMs: number;
  arenaMaxRetries: number;
  arenaBackoffBaseMs: number;
  arenaMaxConcurrentRequests: number;
  arenaDefaultPerPage: number;
  arenaEnableV2SearchFallback: boolean;
  arenaImageFetchTimeoutMs: number;
  arenaImageFetchMaxBytes: number;
  arenaImageFetchMaxConcurrent: number;
  arenaImageFetchUserAgent: string;
}

export interface HttpServerConfig extends ServerConfig {
  mcpHttpHost: string;
  mcpHttpPort: number;
  mcpHttpPath: string;
  mcpHttpStateful: boolean;
  mcpHttpEnableCors: boolean;
  mcpHttpAllowedOrigins: string[];
  mcpHttpReadKeys: string[];
  mcpHttpWriteKeys: string[];
}

export const DEFAULT_ARENA_API_BASE_URL = "https://api.are.na";
export const DEFAULT_ARENA_API_TIMEOUT_MS = 15_000;
export const DEFAULT_ARENA_MAX_RETRIES = 5;
export const DEFAULT_ARENA_BACKOFF_BASE_MS = 500;
export const DEFAULT_ARENA_MAX_CONCURRENT_REQUESTS = 4;
export const DEFAULT_ARENA_DEFAULT_PER_PAGE = 50;
export const DEFAULT_ARENA_IMAGE_FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_ARENA_IMAGE_FETCH_MAX_BYTES = 2_000_000;
export const DEFAULT_ARENA_IMAGE_FETCH_MAX_CONCURRENT = 3;
export const DEFAULT_ARENA_IMAGE_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
export const DEFAULT_MCP_HTTP_HOST = "0.0.0.0";
export const DEFAULT_MCP_HTTP_PORT = 8787;
export const DEFAULT_MCP_HTTP_PATH = "/mcp";

function parseInteger(
  input: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (input === undefined || input.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be an integer, received "${input}".`);
  }
  return Math.min(Math.max(parsed, min), max);
}

function parseBoolean(input: string | undefined, fallback: boolean): boolean {
  if (input === undefined || input.trim() === "") {
    return fallback;
  }
  const normalized = input.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  throw new Error(`Boolean env var expected, received "${input}".`);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function normalizePath(pathValue: string): string {
  const trimmed = pathValue.trim();
  if (trimmed.length === 0) {
    return DEFAULT_MCP_HTTP_PATH;
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash;
}

function parseCsvList(input: string | undefined): string[] {
  if (!input || input.trim() === "") {
    return [];
  }
  const values = input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return Array.from(new Set(values));
}

export function clampPerPage(per: number): number {
  if (Number.isNaN(per)) {
    return DEFAULT_ARENA_DEFAULT_PER_PAGE;
  }
  return Math.max(1, Math.min(100, Math.floor(per)));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const token = env.ARENA_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing required env var ARENA_ACCESS_TOKEN.");
  }

  const baseUrl = normalizeBaseUrl(env.ARENA_API_BASE_URL ?? DEFAULT_ARENA_API_BASE_URL);

  return {
    arenaAccessToken: token,
    arenaApiBaseUrl: baseUrl,
    arenaApiTimeoutMs: parseInteger(
      env.ARENA_API_TIMEOUT_MS,
      "ARENA_API_TIMEOUT_MS",
      DEFAULT_ARENA_API_TIMEOUT_MS,
      1_000,
      120_000,
    ),
    arenaMaxRetries: parseInteger(
      env.ARENA_MAX_RETRIES,
      "ARENA_MAX_RETRIES",
      DEFAULT_ARENA_MAX_RETRIES,
      0,
      10,
    ),
    arenaBackoffBaseMs: parseInteger(
      env.ARENA_BACKOFF_BASE_MS,
      "ARENA_BACKOFF_BASE_MS",
      DEFAULT_ARENA_BACKOFF_BASE_MS,
      50,
      30_000,
    ),
    arenaMaxConcurrentRequests: parseInteger(
      env.ARENA_MAX_CONCURRENT_REQUESTS,
      "ARENA_MAX_CONCURRENT_REQUESTS",
      DEFAULT_ARENA_MAX_CONCURRENT_REQUESTS,
      1,
      64,
    ),
    arenaDefaultPerPage: clampPerPage(
      parseInteger(
        env.ARENA_DEFAULT_PER_PAGE,
        "ARENA_DEFAULT_PER_PAGE",
        DEFAULT_ARENA_DEFAULT_PER_PAGE,
        1,
        100,
      ),
    ),
    arenaEnableV2SearchFallback: parseBoolean(env.ARENA_ENABLE_V2_SEARCH_FALLBACK, true),
    arenaImageFetchTimeoutMs: parseInteger(
      env.ARENA_IMAGE_FETCH_TIMEOUT_MS,
      "ARENA_IMAGE_FETCH_TIMEOUT_MS",
      DEFAULT_ARENA_IMAGE_FETCH_TIMEOUT_MS,
      500,
      120_000,
    ),
    arenaImageFetchMaxBytes: parseInteger(
      env.ARENA_IMAGE_FETCH_MAX_BYTES,
      "ARENA_IMAGE_FETCH_MAX_BYTES",
      DEFAULT_ARENA_IMAGE_FETCH_MAX_BYTES,
      50_000,
      20_000_000,
    ),
    arenaImageFetchMaxConcurrent: parseInteger(
      env.ARENA_IMAGE_FETCH_MAX_CONCURRENT,
      "ARENA_IMAGE_FETCH_MAX_CONCURRENT",
      DEFAULT_ARENA_IMAGE_FETCH_MAX_CONCURRENT,
      1,
      16,
    ),
    arenaImageFetchUserAgent:
      env.ARENA_IMAGE_FETCH_USER_AGENT?.trim() || DEFAULT_ARENA_IMAGE_FETCH_USER_AGENT,
  };
}

export function loadHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpServerConfig {
  const baseConfig = loadConfig(env);
  const readKeys = parseCsvList(env.MCP_HTTP_READ_KEYS);
  if (readKeys.length === 0) {
    throw new Error("Missing required env var MCP_HTTP_READ_KEYS for HTTP mode.");
  }
  const writeKeys = parseCsvList(env.MCP_HTTP_WRITE_KEYS);

  return {
    ...baseConfig,
    mcpHttpHost: env.MCP_HTTP_HOST?.trim() || DEFAULT_MCP_HTTP_HOST,
    mcpHttpPort: parseInteger(
      env.MCP_HTTP_PORT,
      "MCP_HTTP_PORT",
      DEFAULT_MCP_HTTP_PORT,
      1,
      65535,
    ),
    mcpHttpPath: normalizePath(env.MCP_HTTP_PATH ?? DEFAULT_MCP_HTTP_PATH),
    mcpHttpStateful: parseBoolean(env.MCP_HTTP_STATEFUL, true),
    mcpHttpEnableCors: parseBoolean(env.MCP_HTTP_ENABLE_CORS, false),
    mcpHttpAllowedOrigins: parseCsvList(env.MCP_HTTP_ALLOWED_ORIGINS),
    mcpHttpReadKeys: readKeys,
    mcpHttpWriteKeys: writeKeys,
  };
}
