import type { FormatAdapter, ImportCandidate } from "./adapter";
import { attachmentFromFile, blocksFromUnknown, roleFromUnknown } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";
import type { MessageContentBlock, UniversalAttachment, UniversalMessage } from "../domain/conversation";
import { sanitiseChatGptData } from "./chatgpt-archive";

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

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function assetId(value: unknown): string | undefined {
  const pointer = string(value);
  if (!pointer) return undefined;
  return pointer.split("://").at(-1)?.split("/").at(-1) || undefined;
}

function attachmentFile(input: ImportCandidate, id: string): [string, File] | undefined {
  return [...(input.attachments?.entries() || [])].find(([path, file]) =>
    path.endsWith(`/${id}.dat`) || path === `${id}.dat` || file.name === `${id}.dat` || path.endsWith(`/${id}`),
  );
}

function attachmentName(input: ImportCandidate, path: string, fallback: string): string {
  const mapped = input.attachmentNames?.get(path) || input.attachmentNames?.get(path.split("/").at(-1) || "");
  return mapped?.split("/").at(-1) || fallback;
}

function mimeType(name: string, fallback?: string): string | undefined {
  if (fallback) return fallback;
  const extension = name.split(".").at(-1)?.toLowerCase();
  const types: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    pdf: "application/pdf", txt: "text/plain", csv: "text/csv", wav: "audio/wav", mp3: "audio/mpeg", mp4: "video/mp4",
  };
  return extension ? types[extension] : undefined;
}

interface ChatGptAttachmentReference {
  id: string;
  name?: string;
  mimeType?: string;
  isImage?: boolean;
  size?: number;
}

function attachmentReferences(message: Record<string, unknown>, content: Record<string, unknown>): ChatGptAttachmentReference[] {
  const metadata = record(message.metadata);
  const fromMetadata = Array.isArray(metadata?.attachments) ? metadata.attachments : [];
  const fromParts = Array.isArray(content.parts) ? content.parts : [];
  const references = [...fromMetadata, ...fromParts].flatMap((value): ChatGptAttachmentReference[] => {
    const item = record(value);
    if (!item) return [];
    const id = string(item.id) || assetId(item.asset_pointer);
    if (!id) return [];
    const contentType = string(item.content_type);
    return [{
      id,
      name: string(item.name),
      mimeType: string(item.mime_type) || string(item.mimeType),
      isImage: contentType === "image_asset_pointer" || /^image\//.test(string(item.mime_type) || ""),
      size: typeof item.size === "number" ? item.size : typeof item.size_bytes === "number" ? item.size_bytes : undefined,
    }];
  });
  const unique = new Map<string, ChatGptAttachmentReference>();
  for (const reference of references) {
    const existing = unique.get(reference.id);
    unique.set(reference.id, existing ? {
      ...existing,
      ...reference,
      name: existing.name || reference.name,
      mimeType: existing.mimeType || reference.mimeType,
      isImage: existing.isImage || reference.isImage,
      size: existing.size ?? reference.size,
    } : reference);
  }
  return [...unique.values()];
}

function attachmentFromReference(reference: ChatGptAttachmentReference, input: ImportCandidate): UniversalAttachment {
  const found = attachmentFile(input, reference.id);
  const mappedName = found ? attachmentName(input, found[0], reference.name || reference.id) : reference.name || reference.id;
  const base = found ? attachmentFromFile(found[1], found[0]) : { id: reference.id, name: mappedName };
  return {
    ...base,
    id: reference.id,
    name: mappedName,
    mimeType: mimeType(mappedName, reference.mimeType || base.mimeType),
    size: reference.size ?? base.size,
    sourcePath: found?.[0] || base.sourcePath,
    metadata: { sourceAttachmentId: reference.id, packagedFileFound: Boolean(found) },
  };
}

function thoughtText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  const thought = record(value);
  if (!thought) return undefined;
  // The content is the actual thought text. A summary is the intended fallback
  // for exports where the content stream was omitted.
  for (const candidate of [thought.content, thought.summary]) {
    const text = string(candidate);
    if (text) return text;
  }
  return undefined;
}

function thoughtsText(content: Record<string, unknown>): string | undefined {
  if (string(content.content_type) !== "thoughts" || !Array.isArray(content.thoughts)) return undefined;
  const thoughts = content.thoughts.map(thoughtText).filter((thought): thought is string => Boolean(thought));
  return thoughts.length ? thoughts.join("\n\n") : undefined;
}

function isGenericReasoningRecap(content: Record<string, unknown>): boolean {
  if (string(content.content_type) !== "reasoning_recap") return false;
  const recap = string(content.content)?.trim();
  // These duration/status lines carry no recoverable reasoning and otherwise create
  // a distracting bubble before almost every answer.
  return !recap || /^(?:worked|thought|thinking)(?:\s+for)?\s+(?:a\s+)?(?:couple of |few )?(?:seconds?|minutes?)$/i.test(recap)
    || /^(?:worked|thought|thinking)\s+for\s+\d+(?:\.\d+)?\s+(?:seconds?|minutes?)$/i.test(recap);
}

function contentBlocks(content: Record<string, unknown>, attachments: UniversalAttachment[]): MessageContentBlock[] {
  const contentType = string(content.content_type);
  if (contentType === "reasoning_recap" && string(content.content)) {
    return [{ type: "thinking", thinking: string(content.content)!, summaries: ["ChatGPT reasoning recap"] }];
  }
  if (contentType === "thoughts") {
    const thoughts = thoughtsText(content);
    if (thoughts) return [{ type: "thinking", thinking: thoughts, summaries: ["ChatGPT reasoning"] }];
  }
  const textBlocks = blocksFromUnknown(content.parts ?? content.text ?? content.content)
    .filter((block) => block.type !== "empty" && block.type !== "unknown");
  const attachmentBlocks: MessageContentBlock[] = attachments.map((attachment) =>
    /^image\//.test(attachment.mimeType || "")
      ? { type: "image", attachmentId: attachment.id, alt: attachment.name }
      : { type: "file", attachmentId: attachment.id },
  );
  if ([...textBlocks, ...attachmentBlocks].length) return [...textBlocks, ...attachmentBlocks];
  if (Object.keys(content).length) return [{ type: "unknown", raw: sanitiseChatGptData(content) }];
  return [{ type: "empty", reason: "The exported message contains no text or attachments." }];
}

function chatGptConversationExtra(conversation: Record<string, unknown>): Record<string, unknown> {
  const { mapping: _mapping, title: _title, create_time: _createdAt, update_time: _updatedAt, ...extra } = conversation;
  return sanitiseChatGptData(extra) as Record<string, unknown>;
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
      const suppressedNodeIds = new Set(Object.entries(mapping)
        .map(([nodeId, node]) => ({ nodeId, message: node.message as Record<string, unknown> | null }))
        .filter((node): node is { nodeId: string; message: Record<string, unknown> } => Boolean(node.message?.content))
        .filter(({ message }) => {
          const content = message.content as Record<string, unknown>;
          return isGenericReasoningRecap(content) || (string(content.content_type) === "thoughts" && !thoughtsText(content));
        })
        .map(({ nodeId }) => nodeId));
      const visibleParent = (parent: unknown): string | undefined => {
        let current = typeof parent === "string" ? parent : undefined;
        const seen = new Set<string>();
        while (current && suppressedNodeIds.has(current) && !seen.has(current)) {
          seen.add(current);
          current = typeof mapping[current]?.parent === "string" ? mapping[current].parent as string : undefined;
        }
        return current && (!(current in mapping) || Boolean(mapping[current]?.message)) ? current : undefined;
      };
      const attachments: UniversalAttachment[] = [];
      const attachmentById = new Map<string, UniversalAttachment>();
      const messages: UniversalMessage[] = Object.entries(mapping)
        .map(([nodeId, node]) => ({ nodeId, node, message: node.message as Record<string, unknown> | null }))
        .filter(hasReadableMessage)
        .filter(({ nodeId }) => !suppressedNodeIds.has(nodeId))
        .map(({ nodeId, node, message }) => {
          const author = message.author as Record<string, unknown>;
          const content = message.content as Record<string, unknown>;
          const messageAttachments = attachmentReferences(message, content).map((reference) => {
            const existing = attachmentById.get(reference.id);
            if (existing) return existing;
            const attachment = attachmentFromReference(reference, input);
            attachmentById.set(reference.id, attachment);
            attachments.push(attachment);
            return attachment;
          });
          return {
            // ChatGPT's mapping keys, rather than generated IDs, connect edits and
            // regenerated answers to their parent and sibling branches.
            id: nodeId,
            sourceMessageId: nodeId,
            role: roleFromUnknown(author.role),
            content: contentBlocks(content, messageAttachments),
            createdAt: toIsoDate(message.create_time),
            parentMessageId: visibleParent(node.parent) || visibleParent(message.parent),
            model: typeof message.metadata === "object" && message.metadata && typeof (message.metadata as Record<string, unknown>).model_slug === "string"
              ? (message.metadata as Record<string, unknown>).model_slug as string : undefined,
            attachmentIds: messageAttachments.length ? messageAttachments.map((attachment) => attachment.id) : undefined,
            metadata: {
              chatgpt: sanitiseChatGptData({
                contentType: content.content_type,
                recipient: message.recipient,
                status: message.status,
                metadata: message.metadata,
              }) as Record<string, unknown>,
            },
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
          extra: { chatgpt: chatGptConversationExtra(conversation) },
        },
        messages,
        attachments,
      };
    });
    return { conversations, warnings: [] };
  },
};
