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

  it("uses nested Grok profile data as the imported account without exposing credentials", async () => {
    const file = new File([JSON.stringify({ user: { givenName: "Grace", email: "grace@example.com", userId: "g1" }, api_keys: [{ key: "secret" }] })], "prod-mc-auth-mgmt-api.json", { type: "application/json" });
    const report = await importFiles([file]);
    expect(report.account).toEqual({ displayName: "Grace", email: "grace@example.com" });
    expect(JSON.stringify(report.archive.sections)).not.toContain("secret");
  });

  it("labels anonymous profile and memory files with an unambiguous conversation provider", async () => {
    const profile = new File([JSON.stringify([{ full_name: "Ada", email: "ada@example.com" }])], "users.json", { type: "application/json" });
    const memories = new File([JSON.stringify([{ account_uuid: "account-1", conversations_memory: "Prefers concise answers" }])], "memories.json", { type: "application/json" });
    const conversations = new File([JSON.stringify([{ id: "conversation-1", mapping: { message: { message: { author: { role: "user" }, content: { parts: ["Hello"] } } } } }])], "conversations.json", { type: "application/json" });

    const report = await importFiles([profile, memories, conversations]);

    expect(report.archive.sections?.find((section) => section.kind === "profile")?.items[0]?.fields?.Source).toBe("ChatGPT");
    expect(report.archive.sections?.find((section) => section.kind === "memories")?.items[0]?.fields?.Source).toBe("ChatGPT");
  });
});
