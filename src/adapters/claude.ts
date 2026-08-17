import type { FormatAdapter, ImportCandidate } from "./adapter";
import { makeMessage } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";
import type { UniversalMessage } from "../domain/conversation";

type ClaudeItem = Record<string, unknown>;
const CLAUDE_ROOT_UUID = "00000000-0000-4000-8000-000000000000";

function isClaudeExport(value: unknown): value is ClaudeItem[] {
  return Array.isArray(value) && value.some((item) => item && typeof item === "object" && ("chat_messages" in item || "uuid" in item && "name" in item));
}

function uuidV7Date(id: string): string | undefined {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return undefined;
  const milliseconds = Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
}

function messageTime(message: UniversalMessage): number {
  return message.createdAt ? new Date(message.createdAt).getTime() : Number.NaN;
}

/** Add explicit placeholders for referenced Claude messages omitted from the export. */
export function insertClaudeMissingPlaceholders(messages: UniversalMessage[]): UniversalMessage[] {
  const knownIds = new Set(messages.map((message) => message.id));
  const missingIds = [...new Set(messages.flatMap((message) =>
    message.parentMessageId && !knownIds.has(message.parentMessageId) ? [message.parentMessageId] : [],
  ))];
  const placeholders: UniversalMessage[] = [];

  for (const missingId of missingIds.sort((a, b) => (uuidV7Date(a) || "").localeCompare(uuidV7Date(b) || ""))) {
    const createdAt = uuidV7Date(missingId);
    if (!createdAt) continue;
    const children = messages.filter((message) => message.parentMessageId === missingId);
    const role = children.length && children.every((message) => message.role === "user")
      ? "assistant" as const
      : children.length && children.every((message) => message.role === "assistant") ? "user" as const : "unknown" as const;
    const createdTime = new Date(createdAt).getTime();
    const expectedParentRole = role === "assistant" ? "user" : role === "user" ? "assistant" : undefined;
    const preceding = [...messages, ...placeholders]
      .filter((message) => messageTime(message) < createdTime && (!expectedParentRole || message.role === expectedParentRole))
      .sort((a, b) => messageTime(b) - messageTime(a))[0];
    placeholders.push({
      id: missingId,
      sourceMessageId: missingId,
      role,
      authorName: role === "assistant" ? "Missing assistant message" : role === "user" ? "Missing user message" : "Missing message",
      content: [{ type: "text", text: "Message content is missing from the export." }],
      createdAt,
      parentMessageId: preceding?.id,
      metadata: {
        missingFromExport: true,
        roleInferredFromChildren: role !== "unknown",
        parentInferredFromUuidTime: Boolean(preceding),
      },
    });
  }

  return [...messages, ...placeholders];
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
        const sourceMessages = Array.isArray(item.chat_messages) ? item.chat_messages : Array.isArray(item.messages) ? item.messages : [];
        const messages = insertClaudeMissingPlaceholders(sourceMessages
          .filter((message): message is ClaudeItem => Boolean(message && typeof message === "object"))
          .map(makeMessage)
          .map((message) => message.parentMessageId === CLAUDE_ROOT_UUID ? { ...message, parentMessageId: undefined } : message));
        return {
          id: createId("conversation"),
          provider: { id: "claude", name: "Claude", sourceFormat: "JSON" },
          metadata: {
            title: typeof item.name === "string" ? item.name : typeof item.title === "string" ? item.title : "Untitled conversation",
            createdAt: toIsoDate(item.created_at ?? item.createdAt),
            updatedAt: toIsoDate(item.updated_at ?? item.updatedAt),
            sourceConversationId: typeof item.uuid === "string" ? item.uuid : typeof item.id === "string" ? item.id : undefined,
          },
          messages,
          attachments: [],
        };
      }),
      warnings: [],
    };
  },
};
