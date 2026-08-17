import { describe, expect, it } from "vitest";
import type { UniversalConversation, UniversalMessage } from "../../domain/conversation";
import { mergeConversations } from "./merge-conversations";

function message(id: string, text: string, parentMessageId?: string): UniversalMessage {
  return { id, sourceMessageId: id, role: id.startsWith("assistant") ? "assistant" : "user", content: [{ type: "markdown", markdown: text }], parentMessageId };
}

function conversation(messages: UniversalMessage[]): UniversalConversation {
  return {
    id: "import-local-id",
    provider: { id: "chatgpt", name: "ChatGPT" },
    metadata: { title: "Merge test", sourceConversationId: "source-conversation" },
    messages,
    attachments: [],
  };
}

describe("mergeConversations", () => {
  it("skips an identical re-import within the same parent branch", () => {
    const incoming = conversation([message("user-1", "Hello"), message("assistant-1", "Hi", "user-1")]);
    const initial = mergeConversations([], [incoming], "batch-one");
    const repeated = mergeConversations(initial.conversations, [incoming], "batch-two");

    expect(repeated.conversations).toHaveLength(1);
    expect(repeated.conversations[0]?.messages).toHaveLength(2);
    expect(repeated.stats.addedMessages).toBe(0);
    expect(repeated.stats.skippedMessages).toBe(2);
  });

  it("keeps same-source messages with changed content as sibling revisions", () => {
    const initial = mergeConversations([], [conversation([message("user-1", "Question"), message("assistant-1", "First answer", "user-1")])], "batch-one");
    const merged = mergeConversations(initial.conversations, [conversation([message("user-1", "Question"), message("assistant-1", "Corrected answer", "user-1")])], "batch-two");
    const assistants = merged.conversations[0]!.messages.filter((item) => item.sourceMessageId === "assistant-1");

    expect(assistants).toHaveLength(2);
    expect(new Set(assistants.map((item) => item.parentMessageId)).size).toBe(1);
    expect(merged.stats.revisionMessages).toBe(1);
  });

  it("keeps equal child content when its parent resolves to a different revision", () => {
    const initial = mergeConversations([], [conversation([message("user-1", "Original prompt"), message("assistant-1", "Same response", "user-1")])], "batch-one");
    const merged = mergeConversations(initial.conversations, [conversation([message("user-1", "Edited prompt"), message("assistant-1", "Same response", "user-1")])], "batch-two");
    const users = merged.conversations[0]!.messages.filter((item) => item.sourceMessageId === "user-1");
    const assistants = merged.conversations[0]!.messages.filter((item) => item.sourceMessageId === "assistant-1");

    expect(users).toHaveLength(2);
    expect(assistants).toHaveLength(2);
    expect(new Set(assistants.map((item) => item.parentMessageId))).toEqual(new Set(users.map((item) => item.id)));
  });
});
