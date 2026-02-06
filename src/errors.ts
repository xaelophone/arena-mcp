export interface ArenaErrorContext {
  operation?: string;
  target?: string | number;
  searchFallbackEnabled?: boolean;
}

export class ArenaApiError extends Error {
  readonly status: number;
  readonly responseBody: unknown;
  readonly retryAfterSeconds: number | null;
  readonly url: string;

  constructor(options: {
    message: string;
    status: number;
    responseBody: unknown;
    retryAfterSeconds?: number | null;
    url: string;
  }) {
    super(options.message);
    this.name = "ArenaApiError";
    this.status = options.status;
    this.responseBody = options.responseBody;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.url = options.url;
  }
}

function asDetailsMessage(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }

  const body = responseBody as Record<string, unknown>;
  const details = body.details;
  if (details && typeof details === "object" && "message" in details) {
    const message = (details as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }
  if ("message" in body && typeof body.message === "string" && body.message.trim() !== "") {
    return body.message;
  }
  if ("error" in body) {
    const error = body.error;
    if (typeof error === "string" && error.trim() !== "") {
      return error;
    }
    if (error && typeof error === "object" && "message" in error) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim() !== "") {
        return message;
      }
    }
  }
  return null;
}

export function toUserFacingError(error: unknown, context: ArenaErrorContext = {}): string {
  if (!(error instanceof ArenaApiError)) {
    if (error instanceof Error) {
      return error.message;
    }
    return "Unexpected error while talking to Are.na.";
  }

  const target = context.target !== undefined ? ` (${context.target})` : "";
  const operation = context.operation ? `${context.operation}${target}` : `Operation${target}`;
  const details = asDetailsMessage(error.responseBody);
  const suffix = details ? ` Details: ${details}` : "";

  if (error.status === 400) {
    return `${operation} failed because the request was invalid.${suffix}`;
  }

  if (error.status === 401) {
    return `Access denied. Check ARENA_ACCESS_TOKEN and try again.${suffix}`;
  }

  if (error.status === 403) {
    if (context.operation === "search_arena" && context.searchFallbackEnabled === false) {
      return "Search is unavailable on this account tier. Enable v2 fallback or upgrade to Premium.";
    }
    return `Access denied for ${operation}. This usually means missing permissions.${suffix}`;
  }

  if (error.status === 404) {
    return `${operation} failed because the requested resource was not found.${suffix}`;
  }

  if (error.status === 422) {
    return `${operation} failed validation.${suffix}`;
  }

  if (error.status === 429) {
    if (error.retryAfterSeconds !== null) {
      return `Are.na rate limit exceeded. Retry after ${error.retryAfterSeconds} seconds.`;
    }
    return "Are.na rate limit exceeded. Retry in a moment.";
  }

  if (error.status >= 500) {
    return "Are.na API is temporarily unavailable. Retry shortly.";
  }

  return `${operation} failed with status ${error.status}.${suffix}`;
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function isArenaApiError(error: unknown): error is ArenaApiError {
  return error instanceof ArenaApiError;
}
