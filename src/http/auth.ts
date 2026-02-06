import { timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export const READ_SCOPE = "arena:read";
export const WRITE_SCOPE = "arena:write";

export interface KeyScopeConfig {
  readKeys: string[];
  writeKeys: string[];
}

export function parseBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);
  if (rest.length > 0) {
    return null;
  }
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }
  return token.trim() || null;
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function keyMatches(token: string, candidates: string[]): boolean {
  for (const candidate of candidates) {
    if (constantTimeEquals(token, candidate)) {
      return true;
    }
  }
  return false;
}

export function buildAuthInfoFromToken(
  token: string,
  config: KeyScopeConfig,
): AuthInfo | null {
  const canWrite = keyMatches(token, config.writeKeys);
  const canRead = canWrite || keyMatches(token, config.readKeys);
  if (!canRead) {
    return null;
  }
  const scopes = canWrite ? [READ_SCOPE, WRITE_SCOPE] : [READ_SCOPE];
  return {
    token,
    clientId: canWrite ? "arena-mcp-http-write-client" : "arena-mcp-http-read-client",
    scopes,
    extra: { canWrite },
  };
}

export function hasWriteScope(authInfo: AuthInfo | undefined): boolean {
  if (!authInfo) {
    return false;
  }
  return authInfo.scopes.includes(WRITE_SCOPE);
}
