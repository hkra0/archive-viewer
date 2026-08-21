import { describe, expect, it } from "vitest";
import { chatGptAdapter } from "./chatgpt";
import { claudeAdapter, insertClaudeMissingPlaceholders } from "./claude";
import { genericJsonAdapter } from "./generic-json";
import { deepSeekAdapter } from "./deepseek";
import { geminiAdapter } from "./gemini";
import { grokAdapter } from "./grok";

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
    expect(result.conversations[0]?.messages[0]?.parentMessageId).toBeUndefined();
  });

  it("reads multimodal messages from current ChatGPT conversation shards", () => {
    const text = JSON.stringify([{
      id: "chat-1", title: "Image chat", create_time: 1_700_000_000,
      mapping: {
        root: { message: null },
        message: {
          parent: "root",
          message: {
            author: { role: "user" }, create_time: 1_700_000_001,
            content: { content_type: "multimodal_text", parts: [{ id: "file-image", content_type: "image_asset_pointer" }, "What is this?"] },
            metadata: { attachments: [{ id: "file-image", name: "photo.png", mime_type: "image/png", size: 4 }] },
          },
        },
      },
    }]);
    const asset = new File([new Uint8Array([137, 80, 78, 71])], "file-image.dat", { type: "application/octet-stream" });
    const result = chatGptAdapter.parse({
      name: "conversations-000.json", text,
      attachments: new Map([["file-image.dat", asset]]),
      attachmentNames: new Map([["file-image.dat", "photo.png"]]),
    });
    const conversation = result.conversations[0]!;

    expect(conversation.messages[0]?.content).toEqual([
      { type: "markdown", markdown: "What is this?" },
      { type: "image", attachmentId: "file-image", alt: "photo.png" },
    ]);
    expect(conversation.attachments).toMatchObject([{ id: "file-image", name: "photo.png", mimeType: "image/png", size: 4, sourcePath: "file-image.dat" }]);
  });

  it("preserves ChatGPT recaps, unknown blocks, and non-sensitive export metadata", () => {
    const text = JSON.stringify([{
      id: "chat-1", title: "Rich chat", conversation_template_id: "g-template", access_token: "discard-me",
      mapping: {
        root: { message: null },
        recap: { parent: "root", message: { author: { role: "assistant" }, content: { content_type: "reasoning_recap", content: "Compared two approaches." } } },
        future: { parent: "recap", message: { author: { role: "assistant" }, content: { content_type: "future_payload", data: { value: 1 } }, metadata: { api_key: "discard-me", safe: "keep-me" } } },
      },
    }]);
    const conversation = chatGptAdapter.parse({ name: "conversations-000.json", text }).conversations[0]!;

    expect(conversation.messages[0]?.content).toEqual([{ type: "thinking", thinking: "Compared two approaches.", summaries: ["ChatGPT reasoning recap"] }]);
    expect(conversation.messages[1]?.content).toEqual([{ type: "unknown", raw: { content_type: "future_payload", data: { value: 1 } } }]);
    expect(conversation.messages[1]?.metadata).toMatchObject({ chatgpt: { metadata: { safe: "keep-me" } } });
    expect(JSON.stringify(conversation.metadata.extra)).toContain("g-template");
    expect(JSON.stringify(conversation.metadata.extra)).not.toContain("discard-me");
  });

  it("keeps useful ChatGPT thought summaries but removes generic duration recaps", () => {
    const text = JSON.stringify([{
      id: "chat-1", title: "Thoughts", mapping: {
        root: { message: null },
        prompt: { parent: "root", message: { author: { role: "user" }, content: { parts: ["Hello"] } } },
        recap: { parent: "prompt", message: { author: { role: "assistant" }, content: { content_type: "reasoning_recap", content: "Worked for a couple of seconds" } } },
        thought: { parent: "recap", message: { author: { role: "assistant" }, content: { content_type: "thoughts", thoughts: [{ chunks: [], content: "", finished: true, summary: "Checked the source data." }] } } },
      },
    }]);
    const messages = chatGptAdapter.parse({ name: "conversations-000.json", text }).conversations[0]!.messages;

    expect(messages.map((message) => message.id)).toEqual(["prompt", "thought"]);
    expect(messages[1]).toMatchObject({ parentMessageId: "prompt", content: [{ type: "thinking", thinking: "Checked the source data.", summaries: ["ChatGPT reasoning"] }] });
  });

  it("prefers extracted ChatGPT thought content and falls back to its summary", () => {
    const text = JSON.stringify([{
      id: "chat-1", title: "Thoughts", mapping: {
        root: { message: null },
        content: { parent: "root", message: { author: { role: "assistant" }, content: { content_type: "thoughts", thoughts: [{ content: "Read the attachment first.", summary: "Read attachment" }] } } },
        summary: { parent: "content", message: { author: { role: "assistant" }, content: { content_type: "thoughts", thoughts: [{ content: "", summary: "Checked the source data." }] } } },
      },
    }]);
    const messages = chatGptAdapter.parse({ name: "conversations-000.json", text }).conversations[0]!.messages;
    expect(messages[0]?.content).toMatchObject([{ type: "thinking", thinking: "Read the attachment first." }]);
    expect(messages[1]?.content).toMatchObject([{ type: "thinking", thinking: "Checked the source data." }]);
  });

  it("preserves Claude message parents so edited prompts remain branches", () => {
    const result = claudeAdapter.parse({
      name: "conversations.json",
      text: JSON.stringify([{
        uuid: "conversation-1", name: "A Claude chat", chat_messages: [
          { uuid: "prompt-original", parent_message_uuid: "00000000-0000-4000-8000-000000000000", sender: "human", text: "Original", content: [], created_at: "2026-08-01T10:00:00Z" },
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

  it("inserts a labelled placeholder for an omitted Claude reply", () => {
    const messages = insertClaudeMissingPlaceholders([
      { id: "01a00afb-e2ac-7428-a51e-48dafec32eb0", role: "user", createdAt: "2026-08-16T14:31:02.417Z", content: [{ type: "text", text: "Question" }] },
      { id: "01a00b11-82fc-7f2f-a4f0-63433a9ec5ca", role: "user", parentMessageId: "01a00afb-e2ae-798f-85e3-c0b8cf44b9f1", createdAt: "2026-08-16T14:54:41.268Z", content: [{ type: "text", text: "Follow-up" }] },
    ]);
    const placeholder = messages.find(({ id }) => id === "01a00afb-e2ae-798f-85e3-c0b8cf44b9f1");
    expect(placeholder).toMatchObject({
      role: "assistant",
      parentMessageId: "01a00afb-e2ac-7428-a51e-48dafec32eb0",
      metadata: { missingFromExport: true, roleInferredFromChildren: true, parentInferredFromUuidTime: true },
    });
  });

  it("preserves Claude text fallbacks, thinking, tools, empty messages, and attachment metadata", () => {
    const result = claudeAdapter.parse({
      name: "conversations.json",
      text: JSON.stringify([{ uuid: "conversation-rich", name: "Rich export", chat_messages: [
        { uuid: "fallback", sender: "human", text: "Text survives", content: [] },
        { uuid: "rich", sender: "assistant", content: [
          { type: "thinking", thinking: "Reasoning", summaries: [{ summary: "Plan" }] },
          { type: "tool_use", name: "search", input: { q: "archive" } },
          { type: "tool_result", content: "Found", is_error: false },
          { type: "future_block", payload: 1 },
        ], attachments: [{ uuid: "file-1", file_name: "notes.md", file_type: "text/markdown", extracted_content: "# Notes" }] },
        { uuid: "empty", sender: "assistant", content: [], text: "" },
      ] }]),
    });
    const conversation = result.conversations[0]!;
    expect(conversation.messages[0]!.content).toEqual([{ type: "markdown", markdown: "Text survives" }]);
    expect(conversation.messages[1]!.content.map((block) => block.type)).toEqual(["thinking", "tool-call", "tool-result", "unknown", "file"]);
    expect(conversation.messages[2]!.content[0]!.type).toBe("empty");
    expect(conversation.attachments[0]).toMatchObject({ id: "file-1", name: "notes.md", textContent: "# Notes" });
  });

  it("consolidates Claude empty-message warnings across conversations", () => {
    const result = claudeAdapter.parse({
      name: "conversations.json",
      text: JSON.stringify([
        { uuid: "one", chat_messages: [{ uuid: "one-empty", content: [] }, { uuid: "one-empty-too", content: [] }] },
        { uuid: "two", chat_messages: [{ uuid: "two-empty", content: [] }] },
      ]),
    });
    expect(result.warnings).toEqual([expect.objectContaining({
      code: "EMPTY_MESSAGES_PRESERVED", count: 3, conversationCount: 2,
    })]);
  });

  it("reads DeepSeek fragment mappings without mixing reasoning into the answer", () => {
    const text = JSON.stringify([{ id: "deepseek-chat", title: "DeepSeek chat", mapping: {
      root: { id: "root", parent: null, message: null },
      one: { id: "one", parent: "root", message: { model: "deepseek-reasoner", inserted_at: "2026-08-01T10:00:00+08:00", fragments: [{ type: "REQUEST", content: "Question" }] } },
      two: { id: "two", parent: "one", message: { model: "deepseek-reasoner", inserted_at: "2026-08-01T10:01:00+08:00", fragments: [{ type: "THINK", content: "Private reasoning" }, { type: "RESPONSE", content: "Answer" }] } },
    } }]);
    expect(deepSeekAdapter.detect({ name: "conversations.json", text }).supported).toBe(true);
    const messages = deepSeekAdapter.parse({ name: "conversations.json", text }).conversations[0]!.messages;
    expect(messages.map((message) => [message.role, message.parentMessageId, message.content])).toEqual([
      ["user", undefined, [{ type: "markdown", markdown: "Question" }]],
      ["assistant", "one", [{ type: "markdown", markdown: "Answer" }]],
    ]);
  });

  it("reads nested Grok responses and MongoDB dates", () => {
    const text = JSON.stringify({ conversations: [{ conversation: { id: "grok-chat", title: "Grok chat", create_time: "2026-08-01T10:00:00Z" }, responses: [
      { response: { _id: "one", sender: "human", message: "Question", create_time: { $date: { $numberLong: "1785578400000" } } } },
      { response: { _id: "two", sender: "assistant", message: "Answer", parent_response_id: "one", model: "grok-4" } },
    ] }] });
    expect(grokAdapter.detect({ name: "prod-grok-backend.json", text }).supported).toBe(true);
    const result = grokAdapter.parse({ name: "prod-grok-backend.json", text }).conversations[0]!;
    expect(result.messages.map((message) => [message.role, message.parentMessageId])).toEqual([["user", undefined], ["assistant", "one"]]);
    expect(result.metadata.modelNames).toEqual(["grok-4"]);
  });

  it("groups Gemini Takeout activities by source conversation", () => {
    const html = `<html><body><div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">Prompted&nbsp;First question<br>2026年6月19日 12:23:08 CST<br><p>First answer</p></div><div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1 mdl-typography--text-right"></div><div class="content-cell mdl-cell mdl-cell--12-col mdl-typography--caption">https://gemini.google.com/app/chat-1</div></body></html>`;
    expect(geminiAdapter.detect({ name: "Gemini Apps/activity.html", text: html }).supported).toBe(true);
    const result = geminiAdapter.parse({ name: "Gemini Apps/activity.html", text: html }).conversations[0]!;
    expect(result.metadata).toMatchObject({ title: "First question", sourceConversationId: "chat-1" });
    expect(result.messages.map((message) => [message.role, message.content])).toEqual([
      ["user", [{ type: "markdown", markdown: "First question" }]],
      ["assistant", [{ type: "markdown", markdown: "First answer" }]],
    ]);
  });

});
