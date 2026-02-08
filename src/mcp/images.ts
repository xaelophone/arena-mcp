import type { BlobResourceContents, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import type { NormalizedBlock, NormalizedConnectable } from "../arena/types.js";

const DEFAULT_MAX_IMAGES = 4;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export interface ImageFetchOptions {
  fetchImpl?: typeof fetch;
  maxImages?: number;
  maxBytes?: number;
  timeoutMs?: number;
  maxConcurrent?: number;
  userAgent?: string;
}

export interface ImageFetchTarget {
  urls: string[];
  sourceId?: number;
}

type ImageFetchFailureReason =
  | "http_error"
  | "non_image_content_type"
  | "content_length_exceeded"
  | "body_too_large"
  | "empty_body"
  | "timeout"
  | "network_error";

export interface ImageFetchDetail {
  target_index: number;
  source_id: number | null;
  candidate_urls: string[];
  attempted_urls: string[];
  selected_url: string | null;
  success: boolean;
  attempts: number;
  reason: ImageFetchFailureReason | null;
  status: number | null;
  mime_type: string | null;
  content_length: number | null;
  bytes: number | null;
}

export interface ImageFetchSummary {
  attempted_targets: number;
  successful_targets: number;
  failed_targets: number;
  max_images: number;
  max_bytes: number;
  timeout_ms: number;
  max_concurrent: number;
  user_agent: string;
  details: ImageFetchDetail[];
}

export interface ImageContentBuildResult {
  content: ImageContent[];
  summary: ImageFetchSummary;
}

interface NormalizedImageFetchOptions {
  fetchImpl: typeof fetch;
  maxImages: number;
  maxBytes: number;
  timeoutMs: number;
  maxConcurrent: number;
  userAgent: string;
}

interface ImageFetchSuccess {
  ok: true;
  url: string;
  status: number;
  mimeType: string;
  contentLength: number | null;
  bytes: number;
  base64: string;
}

interface ImageFetchFailure {
  ok: false;
  url: string;
  status: number | null;
  mimeType: string | null;
  contentLength: number | null;
  bytes: number | null;
  reason: ImageFetchFailureReason;
}

type ImageFetchResult = ImageFetchSuccess | ImageFetchFailure;

interface ImagePayloadResult {
  targetIndex: number;
  sourceId: number | null;
  candidateUrls: string[];
  attemptedUrls: string[];
  payload: { mimeType: string; base64: string } | null;
  failure: ImageFetchFailure | null;
  successMeta:
    | {
        url: string;
        status: number;
        mimeType: string;
        contentLength: number | null;
        bytes: number;
      }
    | null;
}

function dedupeAndLimit(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function normalizeImageCandidates(block: NormalizedBlock): string[] {
  if (block.type !== "Image" || !block.image) {
    return [];
  }
  return [
    block.image.src ?? "",
    block.image.large ?? "",
    block.image.medium ?? "",
    block.image.small ?? "",
    block.image.square ?? "",
  ];
}

function normalizeOptions(options: ImageFetchOptions): NormalizedImageFetchOptions {
  return {
    fetchImpl: options.fetchImpl ?? fetch,
    maxImages: options.maxImages ?? DEFAULT_MAX_IMAGES,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxConcurrent: options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
    userAgent: options.userAgent?.trim() || DEFAULT_USER_AGENT,
  };
}

function normalizeTargets(
  imageSources: string[] | ImageFetchTarget[],
  maxImages: number,
): ImageFetchTarget[] {
  if (imageSources.length === 0 || maxImages <= 0) {
    return [];
  }

  if (typeof imageSources[0] === "string") {
    const urls = dedupeAndLimit(imageSources as string[], maxImages);
    return urls.map((url) => ({ urls: [url] }));
  }

  const targets = imageSources as ImageFetchTarget[];
  const output: ImageFetchTarget[] = [];
  for (const target of targets) {
    const urls = dedupeAndLimit(target.urls, 5);
    if (urls.length === 0) {
      continue;
    }
    output.push({ urls, sourceId: target.sourceId });
    if (output.length >= maxImages) {
      break;
    }
  }
  return output;
}

export function extractImageUrlsFromBlock(block: NormalizedBlock, maxImages = DEFAULT_MAX_IMAGES): string[] {
  return dedupeAndLimit(normalizeImageCandidates(block), maxImages);
}

export function extractImageUrlsFromConnectables(
  items: NormalizedConnectable[],
  maxImages = DEFAULT_MAX_IMAGES,
): string[] {
  const candidates: string[] = [];
  for (const item of items) {
    if (item.type === "Channel") {
      continue;
    }
    if (item.type === "Image") {
      const primary = item.image?.src ?? item.image?.large ?? item.image?.medium ?? item.image?.small ?? "";
      if (primary) {
        candidates.push(primary);
      }
    }
  }
  return dedupeAndLimit(candidates, maxImages);
}

export function extractImageTargetsFromBlock(
  block: NormalizedBlock,
  maxImages = DEFAULT_MAX_IMAGES,
): ImageFetchTarget[] {
  if (maxImages <= 0) {
    return [];
  }
  const candidates = dedupeAndLimit(normalizeImageCandidates(block), 5);
  if (candidates.length === 0) {
    return [];
  }
  return [{ urls: candidates, sourceId: block.id }];
}

export function extractImageTargetsFromConnectables(
  items: NormalizedConnectable[],
  maxImages = DEFAULT_MAX_IMAGES,
): ImageFetchTarget[] {
  const targets: ImageFetchTarget[] = [];
  for (const item of items) {
    if (item.type === "Channel" || item.type !== "Image") {
      continue;
    }
    const candidates = dedupeAndLimit(normalizeImageCandidates(item), 5);
    if (candidates.length === 0) {
      continue;
    }
    targets.push({ urls: candidates, sourceId: item.id });
    if (targets.length >= maxImages) {
      break;
    }
  }
  return targets;
}

async function fetchImageBytes(url: string, options: NormalizedImageFetchOptions): Promise<ImageFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": options.userAgent,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    const status = response.status;
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null;
    const normalizedContentLength = Number.isFinite(contentLength) ? contentLength : null;

    if (!response.ok) {
      return {
        ok: false,
        url,
        status,
        mimeType: mimeType || null,
        contentLength: normalizedContentLength,
        bytes: null,
        reason: "http_error",
      };
    }
    if (!mimeType.startsWith("image/")) {
      return {
        ok: false,
        url,
        status,
        mimeType: mimeType || null,
        contentLength: normalizedContentLength,
        bytes: null,
        reason: "non_image_content_type",
      };
    }
    if (normalizedContentLength !== null && normalizedContentLength > options.maxBytes) {
      return {
        ok: false,
        url,
        status,
        mimeType,
        contentLength: normalizedContentLength,
        bytes: null,
        reason: "content_length_exceeded",
      };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      return {
        ok: false,
        url,
        status,
        mimeType,
        contentLength: normalizedContentLength,
        bytes: 0,
        reason: "empty_body",
      };
    }
    if (bytes.byteLength > options.maxBytes) {
      return {
        ok: false,
        url,
        status,
        mimeType,
        contentLength: normalizedContentLength,
        bytes: bytes.byteLength,
        reason: "body_too_large",
      };
    }

    return {
      ok: true,
      url,
      status,
      mimeType,
      contentLength: normalizedContentLength,
      bytes: bytes.byteLength,
      base64: Buffer.from(bytes).toString("base64"),
    };
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      url,
      status: null,
      mimeType: null,
      contentLength: null,
      bytes: null,
      reason: isAbortError ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        continue;
      }
      results[currentIndex] = await mapper(item, currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchTarget(
  target: ImageFetchTarget,
  targetIndex: number,
  options: NormalizedImageFetchOptions,
): Promise<ImagePayloadResult> {
  const attemptedUrls: string[] = [];
  let lastFailure: ImageFetchFailure | null = null;

  for (const url of target.urls) {
    attemptedUrls.push(url);
    const result = await fetchImageBytes(url, options);
    if (result.ok) {
      return {
        targetIndex,
        sourceId: target.sourceId ?? null,
        candidateUrls: target.urls,
        attemptedUrls,
        payload: {
          mimeType: result.mimeType,
          base64: result.base64,
        },
        failure: null,
        successMeta: {
          url: result.url,
          status: result.status,
          mimeType: result.mimeType,
          contentLength: result.contentLength,
          bytes: result.bytes,
        },
      };
    }
    lastFailure = result;
  }

  return {
    targetIndex,
    sourceId: target.sourceId ?? null,
    candidateUrls: target.urls,
    attemptedUrls,
    payload: null,
    failure: lastFailure,
    successMeta: null,
  };
}

function buildSummary(results: ImagePayloadResult[], options: NormalizedImageFetchOptions): ImageFetchSummary {
  const details: ImageFetchDetail[] = results
    .slice()
    .sort((left, right) => left.targetIndex - right.targetIndex)
    .map((result) => {
      if (result.successMeta) {
        return {
          target_index: result.targetIndex,
          source_id: result.sourceId,
          candidate_urls: result.candidateUrls,
          attempted_urls: result.attemptedUrls,
          selected_url: result.successMeta.url,
          success: true,
          attempts: result.attemptedUrls.length,
          reason: null,
          status: result.successMeta.status,
          mime_type: result.successMeta.mimeType,
          content_length: result.successMeta.contentLength,
          bytes: result.successMeta.bytes,
        };
      }

      return {
        target_index: result.targetIndex,
        source_id: result.sourceId,
        candidate_urls: result.candidateUrls,
        attempted_urls: result.attemptedUrls,
        selected_url: result.failure?.url ?? null,
        success: false,
        attempts: result.attemptedUrls.length,
        reason: result.failure?.reason ?? "network_error",
        status: result.failure?.status ?? null,
        mime_type: result.failure?.mimeType ?? null,
        content_length: result.failure?.contentLength ?? null,
        bytes: result.failure?.bytes ?? null,
      };
    });

  const successfulTargets = details.filter((detail) => detail.success).length;
  return {
    attempted_targets: details.length,
    successful_targets: successfulTargets,
    failed_targets: details.length - successfulTargets,
    max_images: options.maxImages,
    max_bytes: options.maxBytes,
    timeout_ms: options.timeoutMs,
    max_concurrent: options.maxConcurrent,
    user_agent: options.userAgent,
    details,
  };
}

async function buildImagePayloads(
  imageSources: string[] | ImageFetchTarget[],
  options: ImageFetchOptions = {},
): Promise<{ results: ImagePayloadResult[]; summary: ImageFetchSummary }> {
  const normalizedOptions = normalizeOptions(options);
  const targets = normalizeTargets(imageSources, normalizedOptions.maxImages);

  const results = await mapWithConcurrency(targets, normalizedOptions.maxConcurrent, (target, index) =>
    fetchTarget(target, index, normalizedOptions),
  );

  const summary = buildSummary(results, normalizedOptions);
  return { results, summary };
}

export async function buildImageContentWithSummary(
  imageSources: string[] | ImageFetchTarget[],
  options: ImageFetchOptions = {},
): Promise<ImageContentBuildResult> {
  const { results, summary } = await buildImagePayloads(imageSources, options);
  const content: ImageContent[] = [];

  for (const result of results.sort((left, right) => left.targetIndex - right.targetIndex)) {
    if (!result.payload) {
      continue;
    }
    content.push({
      type: "image",
      data: result.payload.base64,
      mimeType: result.payload.mimeType,
    });
  }

  return { content, summary };
}

export async function buildImageContent(
  imageSources: string[] | ImageFetchTarget[],
  options: ImageFetchOptions = {},
): Promise<ImageContent[]> {
  const { content } = await buildImageContentWithSummary(imageSources, options);
  return content;
}

export async function buildImageResourceContents(
  imageSources: string[] | ImageFetchTarget[],
  baseUri: string,
  options: ImageFetchOptions = {},
): Promise<BlobResourceContents[]> {
  const { results } = await buildImagePayloads(imageSources, options);
  const content: BlobResourceContents[] = [];
  for (const result of results.sort((left, right) => left.targetIndex - right.targetIndex)) {
    if (!result.payload) {
      continue;
    }
    content.push({
      uri: `${baseUri}#image-${result.targetIndex + 1}`,
      mimeType: result.payload.mimeType,
      blob: result.payload.base64,
    });
  }
  return content;
}
