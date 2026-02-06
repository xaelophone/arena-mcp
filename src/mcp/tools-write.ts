import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArenaClient } from "../arena/client.js";
import {
  CHANNEL_VISIBILITY_VALUES,
  MOVE_CONNECTION_VALUES,
} from "../arena/types.js";
import {
  buildConnectBlockPayload,
  buildCreateBlockPayload,
  buildCreateChannelPayload,
  buildMoveConnectionPayload,
} from "../arena/payloads.js";
import { toUserFacingError } from "../errors.js";
import { toolError, toolSuccess } from "./tool-utils.js";

interface WriteToolDeps {
  arenaClient: ArenaClient;
  requireWriteScope?: (extra: unknown) => string | null;
}

const positiveInteger = z.number().int().positive();
const channelIdsSchema = z.array(positiveInteger).min(1).max(20);

export function registerWriteTools(server: McpServer, deps: WriteToolDeps): void {
  const { arenaClient, requireWriteScope } = deps;

  server.registerTool(
    "create_channel",
    {
      title: "Create Channel",
      description: "Create a new channel for the authenticated user.",
      inputSchema: {
        title: z.string().min(1),
        visibility: z.enum(CHANNEL_VISIBILITY_VALUES).optional(),
        description: z.string().optional(),
        group_id: positiveInteger.optional(),
      },
    },
    async (args, extra) => {
      const denied = requireWriteScope?.(extra);
      if (denied) {
        return toolError(denied);
      }
      try {
        const payload = buildCreateChannelPayload(args);
        const channel = await arenaClient.createChannel(payload);
        const url = `https://www.are.na/channel/${channel.slug}`;
        return toolSuccess(`Created channel "${channel.title}" (${url}).`, {
          channel,
          url,
        });
      } catch (error) {
        return toolError(toUserFacingError(error, { operation: "create_channel" }));
      }
    },
  );

  server.registerTool(
    "create_block",
    {
      title: "Create Block",
      description:
        "Create a text/link/media block and connect it to channels. Local file paths are rejected; use public URLs.",
      inputSchema: {
        value: z.string().min(1),
        channel_ids: channelIdsSchema,
        title: z.string().optional(),
        description: z.string().optional(),
        original_source_url: z.string().url().optional(),
        original_source_title: z.string().optional(),
        alt_text: z.string().optional(),
        insert_at: z.number().int().min(0).optional(),
      },
    },
    async (args, extra) => {
      const denied = requireWriteScope?.(extra);
      if (denied) {
        return toolError(denied);
      }
      try {
        const payload = buildCreateBlockPayload(args);
        const block = await arenaClient.createBlock(payload);
        return toolSuccess(
          `Created ${block.type} block ${block.id}${block.title ? ` (${block.title})` : ""}.`,
          { block },
        );
      } catch (error) {
        return toolError(toUserFacingError(error, { operation: "create_block" }));
      }
    },
  );

  server.registerTool(
    "connect_block",
    {
      title: "Connect Block",
      description: "Connect an existing block to one or more channels.",
      inputSchema: {
        block_id: positiveInteger,
        channel_ids: channelIdsSchema,
        position: z.number().int().min(0).optional(),
      },
    },
    async (args, extra) => {
      const denied = requireWriteScope?.(extra);
      if (denied) {
        return toolError(denied);
      }
      try {
        const payload = buildConnectBlockPayload(args);
        const connection = await arenaClient.connectBlock(payload);
        return toolSuccess(`Connected block ${args.block_id}. Connection ID: ${connection.id}.`, {
          connection,
        });
      } catch (error) {
        return toolError(toUserFacingError(error, { operation: "connect_block", target: args.block_id }));
      }
    },
  );

  server.registerTool(
    "disconnect_connection",
    {
      title: "Disconnect Connection",
      description: "Remove a connection by ID.",
      inputSchema: {
        connection_id: positiveInteger,
      },
    },
    async (args, extra) => {
      const denied = requireWriteScope?.(extra);
      if (denied) {
        return toolError(denied);
      }
      try {
        await arenaClient.disconnectConnection(args.connection_id);
        return toolSuccess(`Disconnected connection ${args.connection_id}.`, {
          connection_id: args.connection_id,
          disconnected: true,
        });
      } catch (error) {
        return toolError(
          toUserFacingError(error, { operation: "disconnect_connection", target: args.connection_id }),
        );
      }
    },
  );

  server.registerTool(
    "move_connection",
    {
      title: "Move Connection",
      description: "Reposition a connection within a channel.",
      inputSchema: {
        connection_id: positiveInteger,
        movement: z.enum(MOVE_CONNECTION_VALUES),
        position: z.number().int().min(0).optional(),
      },
    },
    async (args, extra) => {
      const denied = requireWriteScope?.(extra);
      if (denied) {
        return toolError(denied);
      }
      try {
        const payload = buildMoveConnectionPayload(args);
        const connection = await arenaClient.moveConnection(args.connection_id, payload);
        return toolSuccess(`Moved connection ${args.connection_id} using ${args.movement}.`, {
          connection,
        });
      } catch (error) {
        return toolError(toUserFacingError(error, { operation: "move_connection", target: args.connection_id }));
      }
    },
  );
}
