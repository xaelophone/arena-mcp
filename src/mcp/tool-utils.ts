import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type ToolContent = CallToolResult["content"][number];

export function toolSuccess(
  text: string,
  structuredContent?: Record<string, unknown>,
  extraContent: ToolContent[] = [],
): CallToolResult {
  return {
    content: [{ type: "text", text }, ...extraContent],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

export function toolError(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}
