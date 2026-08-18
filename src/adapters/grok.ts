import type { FormatAdapter } from "./adapter";
import type { UniversalMessage } from "../domain/conversation";
import { blocksFromUnknown, roleFromUnknown } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function grokDate(value: unknown): string | undefined {
  const date = record(value)?.$date;
  const milliseconds = record(date)?.$numberLong ?? date;
  if (typeof milliseconds === "string" && /^\d+$/.test(milliseconds)) return toIsoDate(Number(milliseconds));
  return toIsoDate(milliseconds);
}

function isGrokExport(value: unknown): value is JsonRecord {
  const root = record(value);
  if (!root || !Array.isArray(root.conversations)) return false;
  return root.conversations.some((item) => Array.isArray(record(item)?.responses) && record(record(item)?.conversation)?.id);
}

export const grokAdapter: FormatAdapter = {
  id: "grok",
  displayName: "Grok",
  detect(input) {
    if (!/\.json$/i.test(input.name)) return { supported: false, confidence: 0, reason: "Not JSON" };
    try {
      return isGrokExport(JSON.parse(input.text))
        ? { supported: true, confidence: 1, reason: "Grok backend export structure" }
        : { supported: false, confidence: 0, reason: "No Grok export structure" };
    } catch {
      return { supported: false, confidence: 0, reason: "Not JSON" };
    }
  },
  parse(input) {
    const root = JSON.parse(input.text) as JsonRecord;
    const items = (root.conversations as unknown[]).map(record).filter((item): item is JsonRecord => Boolean(item));
    return {
      conversations: items.flatMap((item) => {
        const conversation = record(item.conversation);
        if (!conversation) return [];
        const messages: UniversalMessage[] = (Array.isArray(item.responses) ? item.responses : []).flatMap((wrapper) => {
          const response = record(record(wrapper)?.response);
          if (!response || typeof response.message !== "string" || !response.message.trim()) return [];
          const id = typeof response._id === "string" ? response._id : createId("message");
          return [{
            id,
            sourceMessageId: typeof response._id === "string" ? response._id : undefined,
            role: roleFromUnknown(response.sender),
            content: blocksFromUnknown(response.message),
            createdAt: grokDate(response.create_time),
            parentMessageId: typeof response.parent_response_id === "string" ? response.parent_response_id : undefined,
            model: typeof response.model === "string" ? response.model : undefined,
          }];
        });
        return [{
          id: createId("conversation"),
          provider: { id: "grok", name: "Grok", sourceFormat: "prod-grok-backend.json" },
          metadata: {
            title: typeof conversation.title === "string" ? conversation.title : "Untitled conversation",
            createdAt: toIsoDate(conversation.create_time),
            updatedAt: toIsoDate(conversation.modify_time),
            sourceConversationId: typeof conversation.id === "string" ? conversation.id : undefined,
            modelNames: [...new Set(messages.map((message) => message.model).filter((model): model is string => Boolean(model)))],
          },
          messages,
          attachments: [],
        }];
      }),
      warnings: [],
    };
  },
};
