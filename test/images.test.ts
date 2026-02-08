import { describe, expect, it, vi } from "vitest";
import type { NormalizedBlock, NormalizedChannel, NormalizedConnectable } from "../src/arena/types.js";
import {
  buildImageContent,
  buildImageContentWithSummary,
  buildImageResourceContents,
  extractImageTargetsFromConnectables,
  extractImageUrlsFromBlock,
  extractImageUrlsFromConnectables,
} from "../src/mcp/images.js";

function makeImageBlock(id: number, src: string): NormalizedBlock {
  return {
    type: "Image",
    id,
    title: `Image ${id}`,
    description: null,
    state: "available",
    visibility: "public",
    commentCount: 0,
    createdAt: null,
    updatedAt: null,
    user: null,
    sourceUrl: null,
    sourceTitle: null,
    content: null,
    image: {
      src,
      small: `${src}?small=1`,
      medium: `${src}?medium=1`,
      large: `${src}?large=1`,
      square: `${src}?square=1`,
      altText: null,
      width: 100,
      height: 100,
      contentType: "image/png",
      filename: "test.png",
      fileSize: 1234,
    },
    attachment: null,
    embed: null,
    connection: null,
  };
}

function makeChannel(id: number): NormalizedChannel {
  return {
    type: "Channel",
    id,
    slug: `channel-${id}`,
    title: `Channel ${id}`,
    description: null,
    state: "available",
    visibility: "closed",
    createdAt: null,
    updatedAt: null,
    owner: null,
    counts: { blocks: 0, channels: 0, contents: 0, collaborators: 1 },
    connection: null,
  };
}

describe("image helpers", () => {
  it("extracts image urls from block and connectables", () => {
    const imageBlock = makeImageBlock(1, "https://img.test/one.png");
    const channel = makeChannel(10);
    const imageUrls = extractImageUrlsFromBlock(imageBlock, 3);
    expect(imageUrls[0]).toBe("https://img.test/one.png");
    expect(imageUrls.length).toBe(3);

    const connectables: NormalizedConnectable[] = [
      channel,
      imageBlock,
      makeImageBlock(2, "https://img.test/two.png"),
    ];
    const connectableUrls = extractImageUrlsFromConnectables(connectables, 2);
    expect(connectableUrls).toEqual(["https://img.test/one.png", "https://img.test/two.png"]);

    const imageTargets = extractImageTargetsFromConnectables(connectables, 2);
    expect(imageTargets.length).toBe(2);
    expect(imageTargets[0]?.urls[0]).toBe("https://img.test/one.png");
    expect(imageTargets[0]?.urls[1]).toContain("?large=1");
  });

  it("builds tool image content from downloadable images", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0, 1, 2]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const content = await buildImageContent(["https://img.test/one.png"], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxImages: 1,
    });
    expect(content.length).toBe(1);
    expect(content[0]?.type).toBe("image");
    expect(content[0]?.mimeType).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://img.test/one.png",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.any(String),
        }),
      }),
    );
  });

  it("skips non-image responses when building resource image blobs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("not image", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([3, 4, 5]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );

    const resources = await buildImageResourceContents(
      ["https://img.test/not-image.txt", "https://img.test/real.jpg"],
      "arena://channel/demo",
      {
        fetchImpl: fetchMock as unknown as typeof fetch,
        maxImages: 2,
      },
    );

    expect(resources.length).toBe(1);
    expect(resources[0]?.mimeType).toBe("image/jpeg");
    expect(resources[0]?.uri).toBe("arena://channel/demo#image-2");
  });

  it("falls back to alternate image URL variants and reports diagnostics", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("blocked", {
          status: 403,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([9, 9, 9]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );

    const result = await buildImageContentWithSummary(
      [{ sourceId: 123, urls: ["https://img.test/primary.png", "https://img.test/fallback.png"] }],
      {
        fetchImpl: fetchMock as unknown as typeof fetch,
        maxImages: 1,
      },
    );

    expect(result.content.length).toBe(1);
    expect(result.summary.successful_targets).toBe(1);
    expect(result.summary.details[0]?.attempts).toBe(2);
    expect(result.summary.details[0]?.selected_url).toBe("https://img.test/fallback.png");
    expect(result.summary.details[0]?.attempted_urls).toEqual([
      "https://img.test/primary.png",
      "https://img.test/fallback.png",
    ]);
  });

  it("reports empty image bodies as explicit failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([]), {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-length": "0" },
      }),
    );

    const result = await buildImageContentWithSummary(["https://img.test/empty.jpg"], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxImages: 1,
    });

    expect(result.content.length).toBe(0);
    expect(result.summary.failed_targets).toBe(1);
    expect(result.summary.details[0]?.reason).toBe("empty_body");
  });
});
