import { describe, expect, it } from "vitest";
import { clampPerPage, loadConfig, loadHttpConfig } from "../src/config.js";

describe("config", () => {
  it("rejects missing ARENA_ACCESS_TOKEN", () => {
    expect(() => loadConfig({})).toThrow("ARENA_ACCESS_TOKEN");
  });

  it("applies defaults and clamps numeric values", () => {
    const config = loadConfig({
      ARENA_ACCESS_TOKEN: "token",
      ARENA_DEFAULT_PER_PAGE: "400",
      ARENA_MAX_RETRIES: "-1",
      ARENA_MAX_CONCURRENT_REQUESTS: "999",
      ARENA_API_BASE_URL: "https://api.are.na/",
    });

    expect(config.arenaAccessToken).toBe("token");
    expect(config.arenaDefaultPerPage).toBe(100);
    expect(config.arenaMaxRetries).toBe(0);
    expect(config.arenaMaxConcurrentRequests).toBe(64);
    expect(config.arenaApiBaseUrl).toBe("https://api.are.na");
  });

  it("parses booleans", () => {
    const config = loadConfig({
      ARENA_ACCESS_TOKEN: "token",
      ARENA_ENABLE_V2_SEARCH_FALLBACK: "false",
    });
    expect(config.arenaEnableV2SearchFallback).toBe(false);
  });

  it("clamps per-page values", () => {
    expect(clampPerPage(0)).toBe(1);
    expect(clampPerPage(50)).toBe(50);
    expect(clampPerPage(1000)).toBe(100);
    expect(clampPerPage(Number.NaN)).toBe(50);
  });

  it("rejects missing MCP_HTTP_READ_KEYS for HTTP mode", () => {
    expect(() =>
      loadHttpConfig({
        ARENA_ACCESS_TOKEN: "token",
      }),
    ).toThrow("MCP_HTTP_READ_KEYS");
  });

  it("parses HTTP mode env values", () => {
    const config = loadHttpConfig({
      ARENA_ACCESS_TOKEN: "token",
      MCP_HTTP_READ_KEYS: "read-1, read-2",
      MCP_HTTP_WRITE_KEYS: "write-1",
      MCP_HTTP_PORT: "9000",
      MCP_HTTP_PATH: "mcp/custom/",
      MCP_HTTP_ENABLE_CORS: "true",
      MCP_HTTP_ALLOWED_ORIGINS: "https://a.com, https://b.com",
    });

    expect(config.mcpHttpReadKeys).toEqual(["read-1", "read-2"]);
    expect(config.mcpHttpWriteKeys).toEqual(["write-1"]);
    expect(config.mcpHttpPort).toBe(9000);
    expect(config.mcpHttpPath).toBe("/mcp/custom");
    expect(config.mcpHttpEnableCors).toBe(true);
    expect(config.mcpHttpAllowedOrigins).toEqual(["https://a.com", "https://b.com"]);
  });
});
