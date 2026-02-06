import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SEARCH_SCOPE_VALUES } from "../arena/types.js";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "summarize_channel",
    {
      title: "Summarize Channel",
      description: "Summarize recurring ideas, clusters, and tensions within a channel.",
      argsSchema: {
        id_or_slug: z.string().min(1),
        focus: z.string().optional(),
      },
    },
    ({ id_or_slug, focus }) => {
      const focusText = focus ? `Focus specifically on: ${focus}.` : "Focus on recurring themes.";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Read channel ${id_or_slug} using get_channel_contents.`,
                "Traverse additional pages if needed.",
                `${focusText}`,
                "Return a synthesis with: key themes, notable blocks, and contradictions.",
              ].join(" "),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "find_connections",
    {
      title: "Find Channel Connections",
      description: "Suggest channels where a block should be connected.",
      argsSchema: {
        block_id: z.number().int().positive(),
        max_suggestions: z.number().int().min(1).max(10).optional(),
      },
    },
    ({ block_id, max_suggestions }) => {
      const limit = max_suggestions ?? 3;
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Inspect block ${block_id} using get_block_details.`,
                "Review my recent channels via arena://me or get_user_contents(type=Channel).",
                `Propose up to ${limit} channel connections with a one-sentence rationale each.`,
                "Do not create connections automatically unless asked.",
              ].join(" "),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "second_brain_synthesis",
    {
      title: "Second Brain Synthesis",
      description: "Create a synthesis across Are.na content for a topic.",
      argsSchema: {
        topic: z.string().min(1),
        scope: z.enum(SEARCH_SCOPE_VALUES).optional(),
      },
    },
    ({ topic, scope }) => {
      const scopeText = scope ? `Limit search scope to "${scope}".` : "Use full accessible scope.";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Research topic "${topic}" in my Are.na graph.`,
                scopeText,
                "Use search_arena and then drill into relevant channels/blocks.",
                "Produce a concise synthesis with cited block IDs and channel slugs.",
              ].join(" "),
            },
          },
        ],
      };
    },
  );
}
