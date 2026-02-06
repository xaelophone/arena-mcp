import { describe, expect, it } from "vitest";
import {
  buildConnectBlockPayload,
  buildCreateBlockPayload,
  buildMoveConnectionPayload,
  looksLikeLocalFilePath,
} from "../src/arena/payloads.js";

describe("payload builders", () => {
  it("rejects local file paths for create_block", () => {
    expect(() =>
      buildCreateBlockPayload({
        value: "/Users/me/Desktop/file.pdf",
        channel_ids: [1],
      }),
    ).toThrow("Local file uploads are not supported");
  });

  it("detects local file path variants", () => {
    expect(looksLikeLocalFilePath("/tmp/file.jpg")).toBe(true);
    expect(looksLikeLocalFilePath("file:///tmp/file.jpg")).toBe(true);
    expect(looksLikeLocalFilePath("C:\\temp\\file.jpg")).toBe(true);
    expect(looksLikeLocalFilePath("https://example.com/file.jpg")).toBe(false);
  });

  it("builds connect block payload with connectable type", () => {
    const payload = buildConnectBlockPayload({
      block_id: 42,
      channel_ids: [10, 11],
      position: 0,
    });
    expect(payload).toEqual({
      connectable_id: 42,
      connectable_type: "Block",
      channel_ids: [10, 11],
      position: 0,
    });
  });

  it("validates move payload requirements", () => {
    expect(() =>
      buildMoveConnectionPayload({
        connection_id: 7,
        movement: "insert_at",
      }),
    ).toThrow("position is required");

    const payload = buildMoveConnectionPayload({
      connection_id: 7,
      movement: "move_down",
    });
    expect(payload).toEqual({ movement: "move_down" });
  });
});
