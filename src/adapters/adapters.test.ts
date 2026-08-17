import { describe, expect, it } from "vitest";
import { chatGptAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { genericJsonAdapter } from "./generic-json";

describe("conversation adapters", () => {
  it("normalises a generic JSON conversation", () => {
    const result = genericJsonAdapter.parse({
      name: "export.json",
      text: JSON.stringify({ title: "Planning", messages: [{ role: "user", content: "Build a reader" }, { role: "assistant", content: "I will start." }] }),
    });
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0]?.metadata.title).toBe("Planning");
    expect(result.conversations[0]?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  it("reads ChatGPT mapping exports", () => {
    const text = JSON.stringify([{
      id: "source-id", title: "A chat", create_time: 1_700_000_000,
      mapping: {
        root: { message: null },
        one: { parent: "root", message: { author: { role: "user" }, content: { parts: ["Hello"] }, create_time: 1_700_000_001 } },
      },
    }]);
    expect(chatGptAdapter.detect({ name: "conversations.json", text }).supported).toBe(true);
    const result = chatGptAdapter.parse({ name: "conversations.json", text });
    expect(result.conversations[0]?.messages[0]?.content).toEqual([{ type: "markdown", markdown: "Hello" }]);
    expect(result.conversations[0]?.messages[0]?.id).toBe("one");
    expect(result.conversations[0]?.messages[0]?.parentMessageId).toBe("root");
  });

  it("preserves Claude message parents so edited prompts remain branches", () => {
    const result = claudeAdapter.parse({
      name: "conversations.json",
      text: JSON.stringify([{
        uuid: "conversation-1", name: "A Claude chat", chat_messages: [
          { uuid: "prompt-original", sender: "human", text: "Original", content: [], created_at: "2026-08-01T10:00:00Z" },
          { uuid: "answer-original", parent_message_uuid: "prompt-original", sender: "assistant", text: "First answer", content: [], created_at: "2026-08-01T10:01:00Z" },
          { uuid: "prompt-edited", parent_message_uuid: "answer-original", sender: "human", text: "Edited", content: [], created_at: "2026-08-01T10:02:00Z" },
          { uuid: "prompt-revised", parent_message_uuid: "answer-original", sender: "human", text: "Revised", content: [], created_at: "2026-08-01T10:03:00Z" },
        ],
      }]),
    });
    const messages = result.conversations[0]!.messages;
    expect(messages.map(({ id, parentMessageId }) => ({ id, parentMessageId }))).toEqual([
      { id: "prompt-original", parentMessageId: undefined },
      { id: "answer-original", parentMessageId: "prompt-original" },
      { id: "prompt-edited", parentMessageId: "answer-original" },
      { id: "prompt-revised", parentMessageId: "answer-original" },
    ]);
  });
});
