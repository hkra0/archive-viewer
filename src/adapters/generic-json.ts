import type { FormatAdapter, ImportCandidate } from "./adapter";
import { makeMessage } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";
import type { ImportWarning } from "../domain/conversation";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asConversations(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.map(record).filter((item): item is Record<string, unknown> => Boolean(item));
  const root = record(data);
  if (!root) return [];
  for (const key of ["conversations", "chats", "items", "data"]) {
    if (Array.isArray(root[key])) return root[key].map(record).filter((item): item is Record<string, unknown> => Boolean(item));
  }
  return [root];
}

export const genericJsonAdapter: FormatAdapter = {
  id: "generic-json",
  displayName: "Generic JSON",
  detect(input) {
    try {
      JSON.parse(input.text);
      return { supported: /\.json$/i.test(input.name), confidence: 0.35, reason: "Valid JSON fallback" };
    } catch {
      return { supported: false, confidence: 0, reason: "Not JSON" };
    }
  },
  parse(input: ImportCandidate) {
    const data: unknown = JSON.parse(input.text);
    const warnings: ImportWarning[] = [];
    const conversations = asConversations(data).map((item) => {
      const possibleMessages = item.messages ?? item.history ?? item.chat ?? item.mapping;
      const rawMessages = Array.isArray(possibleMessages)
        ? possibleMessages
        : possibleMessages && typeof possibleMessages === "object"
          ? Object.values(possibleMessages).map((entry) => record(entry)?.message ?? entry)
          : [];
      const messages = rawMessages.map(record).filter((entry): entry is Record<string, unknown> => Boolean(entry)).map(makeMessage);
      const title = item.title ?? item.name ?? item.subject ?? "Untitled conversation";
      return {
        id: createId("conversation"),
        provider: { id: "generic", name: "Generic", sourceFormat: "JSON" },
        metadata: {
          title: typeof title === "string" ? title : "Untitled conversation",
          createdAt: toIsoDate(item.created_at ?? item.createdAt ?? item.timestamp),
          updatedAt: toIsoDate(item.updated_at ?? item.updatedAt),
          sourceConversationId: typeof item.id === "string" ? item.id : undefined,
        },
        messages,
        attachments: [],
      };
    });
    return { conversations, warnings };
  },
};
