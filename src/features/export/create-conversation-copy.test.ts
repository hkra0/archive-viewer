import { describe, expect, it } from "vitest";
import type { UniversalConversation, UniversalMessage } from "../../domain/conversation";
import { CONTINUATION_PROMPT, continuationPromptForLocale, createConversationExport, DEFAULT_EXPORT_OPTIONS } from "./create-conversation-copy";

const conversation: UniversalConversation = {
  id: "conversation", provider: { id: "test", name: "Test" }, metadata: { title: "Current branch" }, attachments: [], messages: [],
};
const messages: UniversalMessage[] = [
  { id: "user", role: "user", createdAt: "2026-08-16T10:00:00.000Z", content: [{ type: "markdown", markdown: "Question" }] },
  { id: "assistant", role: "assistant", model: "test-model", content: [{ type: "code", language: "ts", code: "const answer = 1;" }] },
];

describe("createConversationExport", () => {
  it("provides locale-specific continuation prompt defaults", () => {
    expect(continuationPromptForLocale("zh-CN")).toBe(CONTINUATION_PROMPT);
    expect(continuationPromptForLocale("en")).toContain("Below is my conversation history");
  });

  it("copies only the supplied branch with selected metadata", () => {
    const result = createConversationExport(conversation, messages, { ...DEFAULT_EXPORT_OPTIONS, includeContinuationPrompt: false, includeTimestamps: true, includeModels: true });
    expect(result).toContain("# Current branch");
    expect(result).toContain("### user · 2026-08-16T10:00:00.000Z");
    expect(result).toContain("### assistant · test-model");
    expect(result).toContain("```ts\nconst answer = 1;\n```");
  });

  it("can omit roles, title, and missing placeholders", () => {
    const missing: UniversalMessage = { id: "missing", role: "assistant", content: [{ type: "text", text: "Missing" }], metadata: { missingFromExport: true } };
    const result = createConversationExport(conversation, [...messages, missing], { ...DEFAULT_EXPORT_OPTIONS, includeTitle: false, includeRoles: false, includeContinuationPrompt: false, includeMissingPlaceholders: false });
    expect(result).not.toContain("Current branch");
    expect(result).not.toContain("### user");
    expect(result).not.toContain("Missing");
  });

  it("adds an edited continuation prompt", () => {
    const result = createConversationExport(conversation, messages, { ...DEFAULT_EXPORT_OPTIONS, continuationPrompt: "Continue from the final request." });
    expect(result).toContain("## Continuation prompt\n\nContinue from the final request.");
    expect(result).not.toContain("以下是我与另一个 AI");
  });
});
