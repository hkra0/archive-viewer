import { describe, expect, it } from "vitest";
import { hasReadableConversationContent, importFiles } from "./import-pipeline";
import type { MessageContentBlock, UniversalConversation } from "../../domain/conversation";

function conversation(content: MessageContentBlock[]): UniversalConversation {
  return { id: "conversation", provider: { id: "generic", name: "Generic" }, metadata: { title: "Test" }, messages: [{ id: "message", role: "unknown" as const, content }], attachments: [] };
}

describe("hasReadableConversationContent", () => {
  it("rejects empty, whitespace-only, and unknown fallback messages", () => {
    expect(hasReadableConversationContent(conversation([]))).toBe(false);
    expect(hasReadableConversationContent(conversation([{ type: "text", text: "  " }]))).toBe(false);
    expect(hasReadableConversationContent(conversation([{ type: "unknown", raw: { original: true } }]))).toBe(false);
  });

  it("keeps text and attachment-backed conversations", () => {
    expect(hasReadableConversationContent(conversation([{ type: "markdown", markdown: "Hello" }]))).toBe(true);
    expect(hasReadableConversationContent(conversation([{ type: "image", attachmentId: "image" }]))).toBe(true);
  });

  it("allows ZIPs larger than the regular per-file limit", async () => {
    const oversizedZipLikeFile = new File([new Uint8Array(26 * 1024 * 1024)], "export.zip");
    const report = await importFiles([oversizedZipLikeFile]);
    expect(report.errors[0]).not.toContain("25 MB safety limit");
  });
});
