import { describe, expect, it } from "vitest";
import { ArenaApiError, toUserFacingError } from "../src/errors.js";

describe("error mapping", () => {
  it("maps 401 to auth guidance", () => {
    const error = new ArenaApiError({
      message: "Unauthorized",
      status: 401,
      responseBody: { error: "Unauthorized" },
      url: "https://api.are.na/v3/me",
    });
    expect(toUserFacingError(error)).toContain("ARENA_ACCESS_TOKEN");
  });

  it("maps 404 to not-found guidance", () => {
    const error = new ArenaApiError({
      message: "Not Found",
      status: 404,
      responseBody: { details: { message: "Missing resource" } },
      url: "https://api.are.na/v3/channels/unknown",
    });
    expect(toUserFacingError(error, { operation: "get_channel_contents" })).toContain("not found");
  });

  it("maps search premium constraint when fallback is disabled", () => {
    const error = new ArenaApiError({
      message: "Forbidden",
      status: 403,
      responseBody: { error: "premium required" },
      url: "https://api.are.na/v3/search",
    });
    expect(
      toUserFacingError(error, { operation: "search_arena", searchFallbackEnabled: false }),
    ).toContain("Premium");
  });
});
