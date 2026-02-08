import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toUserFacingError } from "../errors.js";
import { formatBlockMarkdown, formatChannelMarkdown, formatUserMarkdown } from "../format/markdown.js";
import type { ArenaClient } from "../arena/client.js";
import {
  buildImageResourceContents,
  type ImageFetchOptions,
  extractImageTargetsFromBlock,
  extractImageTargetsFromConnectables,
} from "./images.js";

interface ResourceDeps {
  arenaClient: ArenaClient;
  imageFetchOptions?: Pick<ImageFetchOptions, "maxBytes" | "timeoutMs" | "maxConcurrent" | "userAgent">;
}

function requireVariable(value: string | string[] | undefined, variableName: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim() !== "") {
    return value[0];
  }
  throw new Error(`Missing URI variable ${variableName}.`);
}

export function registerResources(server: McpServer, deps: ResourceDeps): void {
  const { arenaClient, imageFetchOptions } = deps;

  server.registerResource(
    "arena-channel",
    new ResourceTemplate("arena://channel/{idOrSlug}", { list: undefined }),
    {
      title: "Are.na Channel",
      description: "Read a channel and its latest contents.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      try {
        const idOrSlug = requireVariable(variables.idOrSlug, "idOrSlug");
        const channel = await arenaClient.getChannel(idOrSlug);
        const contents = await arenaClient.getChannelContents({ idOrSlug, page: 1 });
        const imageTargets = extractImageTargetsFromConnectables(contents.data, 4);
        const imageContents = await buildImageResourceContents(imageTargets, uri.href, {
          maxImages: 4,
          ...imageFetchOptions,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: formatChannelMarkdown(channel, contents.data, contents.meta),
            },
            ...imageContents,
          ],
        };
      } catch (error) {
        throw new Error(toUserFacingError(error, { operation: "arena://channel", target: uri.href }));
      }
    },
  );

  server.registerResource(
    "arena-block",
    new ResourceTemplate("arena://block/{id}", { list: undefined }),
    {
      title: "Are.na Block",
      description: "Read full details for a block and where it is connected.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      try {
        const blockId = Number.parseInt(requireVariable(variables.id, "id"), 10);
        if (Number.isNaN(blockId)) {
          throw new Error(`Invalid block ID: ${variables.id as string}`);
        }
        const block = await arenaClient.getBlock(blockId);
        const connections = await arenaClient.getBlockConnections({ id: blockId, page: 1 });
        const imageTargets = extractImageTargetsFromBlock(block, 1);
        const imageContents = await buildImageResourceContents(imageTargets, uri.href, {
          maxImages: 1,
          ...imageFetchOptions,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: formatBlockMarkdown(block, connections.data),
            },
            ...imageContents,
          ],
        };
      } catch (error) {
        throw new Error(toUserFacingError(error, { operation: "arena://block", target: uri.href }));
      }
    },
  );

  server.registerResource(
    "arena-user",
    new ResourceTemplate("arena://user/{idOrSlug}", { list: undefined }),
    {
      title: "Are.na User",
      description: "Read user profile and recent content.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      try {
        const idOrSlug = requireVariable(variables.idOrSlug, "idOrSlug");
        const user = await arenaClient.getUser(idOrSlug);
        const contents = await arenaClient.getUserContents({ idOrSlug, page: 1 });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: formatUserMarkdown(user, contents.data, contents.meta),
            },
          ],
        };
      } catch (error) {
        throw new Error(toUserFacingError(error, { operation: "arena://user", target: uri.href }));
      }
    },
  );

  server.registerResource(
    "arena-me",
    "arena://me",
    {
      title: "Are.na Me",
      description: "Read the currently authenticated user profile and latest channels.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      try {
        const me = await arenaClient.getMe();
        const contents = await arenaClient.getUserContents({
          idOrSlug: me.slug,
          page: 1,
          type: "Channel",
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: formatUserMarkdown(me, contents.data, contents.meta),
            },
          ],
        };
      } catch (error) {
        throw new Error(toUserFacingError(error, { operation: "arena://me", target: uri.href }));
      }
    },
  );
}
