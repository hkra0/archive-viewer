import type { FormatAdapter, ImportCandidate } from "./adapter";
import { blocksFromUnknown, roleFromUnknown } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";
import type { UniversalMessage } from "../domain/conversation";

interface ChatGptNodeMessage {
  nodeId: string;
  node: Record<string, unknown>;
  message: Record<string, unknown> | null;
}

function hasReadableMessage(candidate: ChatGptNodeMessage): candidate is ChatGptNodeMessage & { message: Record<string, unknown> } {
  return Boolean(candidate.message && candidate.message.author && candidate.message.content);
}

function isChatGptExport(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.some((item) => item && typeof item === "object" && "mapping" in item);
}

export const chatGptAdapter: FormatAdapter = {
  id: "chatgpt",
  displayName: "ChatGPT",
  detect(input) {
    try {
      const data: unknown = JSON.parse(input.text);
      return isChatGptExport(data)
        ? { supported: true, confidence: 0.98, reason: "ChatGPT mapping structure" }
        : { supported: false, confidence: 0, reason: "No ChatGPT mapping" };
    } catch {
      return { supported: false, confidence: 0, reason: "Not JSON" };
    }
  },
  parse(input: ImportCandidate) {
    const exports = JSON.parse(input.text) as Array<Record<string, unknown>>;
    const conversations = exports.map((conversation) => {
      const mapping = conversation.mapping as Record<string, Record<string, unknown>>;
      const messages: UniversalMessage[] = Object.entries(mapping)
        .map(([nodeId, node]) => ({ nodeId, node, message: node.message as Record<string, unknown> | null }))
        .filter(hasReadableMessage)
        .map(({ nodeId, node, message }) => {
          const author = message.author as Record<string, unknown>;
          const content = message.content as Record<string, unknown>;
          return {
            // ChatGPT's mapping keys, rather than generated IDs, connect edits and
            // regenerated answers to their parent and sibling branches.
            id: nodeId,
            role: roleFromUnknown(author.role),
            content: blocksFromUnknown(content.parts ?? content.text),
            createdAt: toIsoDate(message.create_time),
            parentMessageId: typeof node.parent === "string"
              ? node.parent
              : typeof message.parent === "string" ? message.parent : undefined,
            model: typeof message.metadata === "object" && message.metadata && typeof (message.metadata as Record<string, unknown>).model_slug === "string"
              ? (message.metadata as Record<string, unknown>).model_slug as string : undefined,
          };
        });
      return {
        id: createId("conversation"),
        provider: { id: "chatgpt", name: "ChatGPT", sourceFormat: "conversations.json" },
        metadata: {
          title: typeof conversation.title === "string" ? conversation.title : "Untitled conversation",
          createdAt: toIsoDate(conversation.create_time),
          updatedAt: toIsoDate(conversation.update_time),
          sourceConversationId: typeof conversation.id === "string" ? conversation.id : undefined,
        },
        messages,
        attachments: [],
      };
    });
    return { conversations, warnings: [] };
  },
};
