import type { FormatAdapter } from "./adapter";
import type { UniversalMessage } from "../domain/conversation";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function isDeepSeekExport(value: unknown): value is JsonRecord[] {
  if (!Array.isArray(value)) return false;
  return value.some((conversation) => {
    const mapping = record(record(conversation)?.mapping);
    return mapping && Object.values(mapping).some((node) => {
      const fragments = record(record(node)?.message)?.fragments;
      return Array.isArray(fragments) && fragments.some((fragment) => ["REQUEST", "RESPONSE", "THINK"].includes(String(record(fragment)?.type)));
    });
  });
}

function messageFromNode(nodeId: string, node: JsonRecord, mapping: JsonRecord): UniversalMessage | undefined {
  const source = record(node.message);
  if (!source || !Array.isArray(source.fragments)) return undefined;
  const fragments = source.fragments.map(record).filter((fragment): fragment is JsonRecord => Boolean(fragment));
  const request = fragments.filter((fragment) => fragment.type === "REQUEST");
  const response = fragments.filter((fragment) => fragment.type === "RESPONSE");
  const visible = request.length ? request : response.length ? response : fragments.filter((fragment) => fragment.type === "THINK");
  const text = visible.map((fragment) => typeof fragment.content === "string" ? fragment.content : "").filter(Boolean).join("\n\n");
  if (!text.trim()) return undefined;
  const parent = typeof node.parent === "string" && node.parent !== "root" && record(mapping[node.parent])?.message ? node.parent : undefined;
  return {
    id: nodeId,
    sourceMessageId: nodeId,
    role: request.length ? "user" : "assistant",
    content: [{ type: "markdown", markdown: text }],
    createdAt: toIsoDate(source.inserted_at),
    parentMessageId: parent,
    model: typeof source.model === "string" ? source.model : undefined,
    metadata: {
      fragmentTypes: fragments.map((fragment) => String(fragment.type || "UNKNOWN")),
      hasReasoning: fragments.some((fragment) => fragment.type === "THINK"),
    },
  };
}

export const deepSeekAdapter: FormatAdapter = {
  id: "deepseek",
  displayName: "DeepSeek",
  detect(input) {
    if (!/\.json$/i.test(input.name)) return { supported: false, confidence: 0, reason: "Not JSON" };
    try {
      return isDeepSeekExport(JSON.parse(input.text))
        ? { supported: true, confidence: 1, reason: "DeepSeek fragment mapping" }
        : { supported: false, confidence: 0, reason: "No DeepSeek fragment mapping" };
    } catch {
      return { supported: false, confidence: 0, reason: "Not JSON" };
    }
  },
  parse(input) {
    const data = JSON.parse(input.text) as JsonRecord[];
    return {
      conversations: data.map((conversation) => {
        const mapping = record(conversation.mapping) || {};
        const messages = Object.entries(mapping)
          .map(([nodeId, value]) => record(value) && messageFromNode(nodeId, record(value)!, mapping))
          .filter((message): message is UniversalMessage => Boolean(message));
        return {
          id: createId("conversation"),
          provider: { id: "deepseek", name: "DeepSeek", sourceFormat: "conversations.json" },
          metadata: {
            title: typeof conversation.title === "string" ? conversation.title : "Untitled conversation",
            createdAt: toIsoDate(conversation.inserted_at),
            updatedAt: toIsoDate(conversation.updated_at),
            sourceConversationId: typeof conversation.id === "string" ? conversation.id : undefined,
          },
          messages,
          attachments: [],
        };
      }),
      warnings: [],
    };
  },
};
