import type { BlobResourceContents, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import type { NormalizedBlock, NormalizedConnectable } from "../arena/types.js";

const DEFAULT_MAX_IMAGES = 4;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;

interface ImageFetchOptions {
  fetchImpl?: typeof fetch;
  maxImages?: number;
  maxBytes?: number;
  timeoutMs?: number;
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

async function fetchImageBytes(
  url: string,
  options: Required<Pick<ImageFetchOptions, "fetchImpl" | "maxBytes" | "timeoutMs">>,
): Promise<{ mimeType: string; base64: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!mimeType.startsWith("image/")) {
      return null;
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
        return null;
      }
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > options.maxBytes) {
      return null;
    }

    return {
      mimeType,
      base64: Buffer.from(bytes).toString("base64"),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildImageContent(
  imageUrls: string[],
  options: ImageFetchOptions = {},
): Promise<ImageContent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const urls = dedupeAndLimit(imageUrls, maxImages);
  const content: ImageContent[] = [];
  for (const url of urls) {
    const image = await fetchImageBytes(url, { fetchImpl, maxBytes, timeoutMs });
    if (!image) {
      continue;
    }
    content.push({
      type: "image",
      data: image.base64,
      mimeType: image.mimeType,
    });
  }
  return content;
}

export async function buildImageResourceContents(
  imageUrls: string[],
  baseUri: string,
  options: ImageFetchOptions = {},
): Promise<BlobResourceContents[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const urls = dedupeAndLimit(imageUrls, maxImages);
  const content: BlobResourceContents[] = [];
  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    if (!url) {
      continue;
    }
    const image = await fetchImageBytes(url, { fetchImpl, maxBytes, timeoutMs });
    if (!image) {
      continue;
    }
    content.push({
      uri: `${baseUri}#image-${index + 1}`,
      mimeType: image.mimeType,
      blob: image.base64,
    });
  }
  return content;
}
