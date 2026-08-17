import type { FormatAdapter, ImportCandidate } from "./adapter";
import { blocksFromUnknown, roleFromUnknown } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";
import type { UniversalMessage } from "../domain/conversation";

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
      const messages: UniversalMessage[] = Object.values(mapping)
        .map((node) => node.message as Record<string, unknown> | null)
        .filter((message): message is Record<string, unknown> => Boolean(message && message.author && message.content))
        .map((message) => {
          const author = message.author as Record<string, unknown>;
          const content = message.content as Record<string, unknown>;
          return {
            id: createId("message"),
            role: roleFromUnknown(author.role),
            content: blocksFromUnknown(content.parts ?? content.text),
            createdAt: toIsoDate(message.create_time),
            parentMessageId: typeof message.parent === "string" ? message.parent : undefined,
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
