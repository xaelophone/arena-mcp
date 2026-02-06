import { describe, expect, it } from "vitest";
import {
  buildPaginationFooter,
  formatBlockMarkdown,
  formatChannelMarkdown,
  formatSearchResultsMarkdown,
} from "../src/format/markdown.js";
import type {
  NormalizedBlock,
  NormalizedChannel,
  NormalizedSearchResult,
  PaginationMeta,
} from "../src/arena/types.js";

function makeBaseBlock(type: NormalizedBlock["type"]): NormalizedBlock {
  return {
    id: 1,
    type,
    title: "Block Title",
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
    image: null,
    attachment: null,
    embed: null,
    connection: null,
  };
}

function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    currentPage: 1,
    nextPage: 2,
    prevPage: null,
    perPage: 50,
    totalPages: 3,
    totalCount: 120,
    hasMorePages: true,
    ...overrides,
  };
}

describe("markdown formatting", () => {
  it("renders block details by block type", () => {
    const textBlock = makeBaseBlock("Text");
    textBlock.content = { markdown: "Hello **world**", html: "<p>Hello</p>", plain: "Hello world" };

    const imageBlock = makeBaseBlock("Image");
    imageBlock.image = {
      src: "https://images.test/original.jpg",
      small: null,
      medium: null,
      large: null,
      square: null,
      altText: "Sample alt",
      width: 800,
      height: 600,
      contentType: "image/jpeg",
      filename: "original.jpg",
      fileSize: 1234,
    };

    const attachmentBlock = makeBaseBlock("Attachment");
    attachmentBlock.attachment = {
      url: "https://files.test/file.pdf",
      filename: "file.pdf",
      contentType: "application/pdf",
      fileSize: 4096,
      fileExtension: "pdf",
    };

    const embedBlock = makeBaseBlock("Embed");
    embedBlock.embed = {
      url: "https://player.test/embed/1",
      sourceUrl: "https://videos.test/watch/1",
      html: "<iframe></iframe>",
      title: "Video",
      type: "video",
      authorName: "Author",
    };

    expect(formatBlockMarkdown(textBlock, [])).toContain("Hello **world**");
    expect(formatBlockMarkdown(imageBlock, [])).toContain("https://images.test/original.jpg");
    expect(formatBlockMarkdown(attachmentBlock, [])).toContain("https://files.test/file.pdf");
    expect(formatBlockMarkdown(embedBlock, [])).toContain("https://videos.test/watch/1");
  });

  it("adds pagination footer when more pages are available", () => {
    const footer = buildPaginationFooter(makeMeta(), "Continue with page 2.");
    expect(footer).toContain("End of page 1");
    expect(footer).toContain("Continue with page 2.");
  });

  it("includes continuation hint in channel markdown", () => {
    const channel: NormalizedChannel = {
      type: "Channel",
      id: 2,
      slug: "architecture",
      title: "Architecture",
      description: { markdown: "desc", html: "<p>desc</p>", plain: "desc" },
      state: "available",
      visibility: "closed",
      createdAt: null,
      updatedAt: null,
      owner: null,
      counts: { blocks: 1, channels: 0, contents: 1, collaborators: 1 },
      connection: null,
    };
    const textBlock = makeBaseBlock("Text");
    textBlock.content = { markdown: "First note", html: "<p>First note</p>", plain: "First note" };
    const markdown = formatChannelMarkdown(channel, [textBlock], makeMeta());
    expect(markdown).toContain("get_channel_contents");
    expect(markdown).toContain("architecture");
  });

  it("includes IDs and follow-up hints in search markdown", () => {
    const result: NormalizedSearchResult = {
      sourceApi: "v3",
      items: [
        {
          id: 42,
          entityType: "Block",
          title: "Astro Digital Garden",
          subtitle: "https://astro-digital-garden.example.com",
          slug: null,
          blockType: "Link",
          url: null,
          raw: {},
        },
      ],
      meta: {
        currentPage: 1,
        nextPage: null,
        prevPage: null,
        perPage: 50,
        totalPages: 1,
        totalCount: 1,
        hasMorePages: false,
      },
    };

    const markdown = formatSearchResultsMarkdown(result);
    expect(markdown).toContain("| Type | ID | Title | Subtitle | Hint |");
    expect(markdown).toContain("| Block | 42 | Astro Digital Garden |");
    expect(markdown).toContain("get_block_details(id=42) + get_block_connections(id=42)");
    expect(markdown).toContain("top_result_id: 42");
  });
});
