import type { FormatAdapter, ImportCandidate } from "./adapter";
import { makeMessage } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";

type ClaudeItem = Record<string, unknown>;

function isClaudeExport(value: unknown): value is ClaudeItem[] {
  return Array.isArray(value) && value.some((item) => item && typeof item === "object" && ("chat_messages" in item || "uuid" in item && "name" in item));
}

export const claudeAdapter: FormatAdapter = {
  id: "claude",
  displayName: "Claude",
  detect(input) {
    try {
      return isClaudeExport(JSON.parse(input.text))
        ? { supported: true, confidence: 0.82, reason: "Claude export fields" }
        : { supported: false, confidence: 0, reason: "No Claude export fields" };
    } catch {
      return { supported: false, confidence: 0, reason: "Not JSON" };
    }
  },
  parse(input: ImportCandidate) {
    const data = JSON.parse(input.text) as ClaudeItem[];
    return {
      conversations: data.map((item) => {
        const messages = Array.isArray(item.chat_messages) ? item.chat_messages : Array.isArray(item.messages) ? item.messages : [];
        return {
          id: createId("conversation"),
          provider: { id: "claude", name: "Claude", sourceFormat: "JSON" },
          metadata: {
            title: typeof item.name === "string" ? item.name : typeof item.title === "string" ? item.title : "Untitled conversation",
            createdAt: toIsoDate(item.created_at ?? item.createdAt),
            updatedAt: toIsoDate(item.updated_at ?? item.updatedAt),
            sourceConversationId: typeof item.uuid === "string" ? item.uuid : typeof item.id === "string" ? item.id : undefined,
          },
          messages: messages.filter((message): message is ClaudeItem => Boolean(message && typeof message === "object")).map(makeMessage),
          attachments: [],
        };
      }),
      warnings: [],
    };
  },
};
