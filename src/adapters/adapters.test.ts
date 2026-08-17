import { describe, expect, it } from "vitest";
import { chatGptAdapter } from "./chatgpt";
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
});
