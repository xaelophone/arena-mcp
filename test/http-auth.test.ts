import { describe, expect, it } from "vitest";
import {
  buildAuthInfoFromToken,
  hasWriteScope,
  parseBearerToken,
  READ_SCOPE,
  WRITE_SCOPE,
} from "../src/http/auth.js";

describe("HTTP auth helpers", () => {
  it("parses bearer token", () => {
    expect(parseBearerToken("Bearer abc123")).toBe("abc123");
    expect(parseBearerToken("bearer xyz")).toBe("xyz");
    expect(parseBearerToken("Basic nope")).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it("builds read auth info for read keys", () => {
    const authInfo = buildAuthInfoFromToken("read-key", {
      readKeys: ["read-key"],
      writeKeys: ["write-key"],
    });
    expect(authInfo).not.toBeNull();
    expect(authInfo?.scopes).toContain(READ_SCOPE);
    expect(authInfo?.scopes).not.toContain(WRITE_SCOPE);
    expect(hasWriteScope(authInfo ?? undefined)).toBe(false);
  });

  it("builds write auth info for write keys", () => {
    const authInfo = buildAuthInfoFromToken("write-key", {
      readKeys: ["read-key"],
      writeKeys: ["write-key"],
    });
    expect(authInfo).not.toBeNull();
    expect(authInfo?.scopes).toContain(READ_SCOPE);
    expect(authInfo?.scopes).toContain(WRITE_SCOPE);
    expect(hasWriteScope(authInfo ?? undefined)).toBe(true);
  });

  it("rejects unknown key", () => {
    const authInfo = buildAuthInfoFromToken("other", {
      readKeys: ["read-key"],
      writeKeys: ["write-key"],
    });
    expect(authInfo).toBeNull();
  });
});
