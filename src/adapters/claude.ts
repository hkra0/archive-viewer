import type { FormatAdapter, ImportCandidate } from "./adapter";
import { makeMessage } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";
import type { UniversalMessage } from "../domain/conversation";

type ClaudeItem = Record<string, unknown>;

function isClaudeExport(value: unknown): value is ClaudeItem[] {
  return Array.isArray(value) && value.some((item) => item && typeof item === "object" && ("chat_messages" in item || "uuid" in item && "name" in item));
}

function hasVisibleContent(message: UniversalMessage): boolean {
  return message.content.some((block) =>
    (block.type === "markdown" && block.markdown.trim())
    || (block.type === "text" && block.text.trim())
    || (block.type === "code" && block.code.trim()),
  );
}

/**
 * Claude exports can omit a parent row when a response was interrupted or
 * discarded. Keep true roots intact, but attach later dangling prompts to the
 * most recent completed assistant turn so they do not masquerade as roots.
 */
export function repairClaudeOrphans(messages: UniversalMessage[]): UniversalMessage[] {
  const messageIds = new Set(messages.map((message) => message.id));
  let latestCompletedAssistantId: string | undefined;
  let previousMessageId: string | undefined;

  return messages.map((message) => {
    const hasKnownParent = Boolean(message.parentMessageId && messageIds.has(message.parentMessageId));
    const inferredParentId = hasKnownParent
      ? undefined
      : message.role === "user" ? latestCompletedAssistantId : previousMessageId;
    const repaired = inferredParentId
      ? {
          ...message,
          parentMessageId: inferredParentId,
          metadata: { ...message.metadata, parentInferred: true },
        }
      : message;

    if (repaired.role === "assistant" && hasVisibleContent(repaired)) latestCompletedAssistantId = repaired.id;
    previousMessageId = repaired.id;
    return repaired;
  });
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
        const messages = repairClaudeOrphans(sourceMessages.filter((message): message is ClaudeItem => Boolean(message && typeof message === "object")).map(makeMessage));
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
