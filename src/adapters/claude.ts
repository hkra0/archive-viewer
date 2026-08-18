import type { FormatAdapter, ImportCandidate } from "./adapter";
import { attachmentFromFile, roleFromUnknown } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";
import type { MessageContentBlock, UniversalAttachment, UniversalMessage } from "../domain/conversation";

type ClaudeItem = Record<string, unknown>;
const CLAUDE_ROOT_UUID = "00000000-0000-4000-8000-000000000000";

function record(value: unknown): ClaudeItem | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ClaudeItem : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

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

/** Add explicit placeholders for referenced messages omitted from an export. */
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
      content: [{ type: "empty", reason: "Message content is missing from the export." }],
      createdAt,
      parentMessageId: preceding?.id,
      metadata: { missingFromExport: true, roleInferredFromChildren: role !== "unknown", parentInferredFromUuidTime: Boolean(preceding) },
    });
  }
  return [...messages, ...placeholders];
}

function summaries(block: ClaudeItem): string[] | undefined {
  if (!Array.isArray(block.summaries)) return undefined;
  const values = block.summaries.flatMap((value) => {
    if (typeof value === "string" && value.trim()) return [value];
    const item = record(value);
    return item && string(item.summary) ? [item.summary as string] : [];
  });
  return values.length ? values : undefined;
}

function claudeContentBlocks(source: ClaudeItem): MessageContentBlock[] {
  const raw = Array.isArray(source.content) ? source.content : [];
  const blocks = raw.map((value): MessageContentBlock => {
    const block = record(value);
    if (!block) return { type: "unknown", raw: value };
    const type = string(block.type) || "unknown";
    if (type === "text") return { type: "markdown", markdown: typeof block.text === "string" ? block.text : "" };
    if (type === "thinking") return { type: "thinking", thinking: string(block.thinking) || "", summaries: summaries(block) };
    if (type === "tool_use") return { type: "tool-call", name: string(block.name) || "tool", input: block.input };
    if (type === "tool_result") return { type: "tool-result", name: string(block.name), output: block.content ?? block.output ?? "", isError: block.is_error === true };
    return { type: "unknown", raw: block };
  }).filter((block) => block.type !== "markdown" || block.markdown.length > 0);
  if (!blocks.length && typeof source.text === "string" && source.text.trim()) blocks.push({ type: "markdown", markdown: source.text });
  return blocks;
}

function findPackagedAttachment(input: ImportCandidate, candidates: string[]): [string, File] | undefined {
  const entries = [...(input.attachments?.entries() || [])];
  for (const candidate of candidates.filter(Boolean)) {
    const normalised = candidate.replace(/^\.?\//, "");
    const exact = entries.find(([path]) => path === normalised);
    if (exact) return exact;
    const bySuffix = entries.find(([path, file]) => path.endsWith(`/${normalised}`) || file.name === normalised.split("/").pop());
    if (bySuffix) return bySuffix;
  }
  return undefined;
}

function attachmentFromClaude(value: unknown, input: ImportCandidate): UniversalAttachment | undefined {
  const item = record(value);
  if (!item) return undefined;
  const sourceId = string(item.uuid) || string(item.file_uuid) || string(item.id);
  const name = string(item.file_name) || string(item.filename) || string(item.name) || sourceId || "attachment";
  const path = string(item.file_path) || string(item.path) || string(item.url);
  const found = findPackagedAttachment(input, [path || "", name, sourceId || ""]);
  const base: UniversalAttachment = found ? attachmentFromFile(found[1], found[0]) : { id: sourceId || createId("attachment"), name };
  const sizeValue = item.file_size ?? item.size;
  return {
    ...base,
    id: sourceId || base.id,
    name,
    mimeType: string(item.file_type) || string(item.mime_type) || string(item.mimeType) || base.mimeType,
    size: typeof sizeValue === "number" && sizeValue >= 0 ? sizeValue : base.size,
    sourcePath: found?.[0] || path || base.sourcePath,
    textContent: string(item.extracted_content) || string(item.text_content),
    metadata: { sourceAttachmentId: sourceId, packagedFileFound: Boolean(found) },
  };
}

function messageFromClaude(source: ClaudeItem, input: ImportCandidate): { message: UniversalMessage; attachments: UniversalAttachment[] } {
  const sourceMessageId = string(source.uuid) || string(source.id);
  const attachments = [...(Array.isArray(source.attachments) ? source.attachments : []), ...(Array.isArray(source.files) ? source.files : [])]
    .map((value) => attachmentFromClaude(value, input)).filter((value): value is UniversalAttachment => Boolean(value));
  const content = claudeContentBlocks(source);
  for (const attachment of attachments) {
    content.push(/^image\//.test(attachment.mimeType || "")
      ? { type: "image", attachmentId: attachment.id, alt: attachment.name }
      : { type: "file", attachmentId: attachment.id });
  }
  if (!content.length) content.push({ type: "empty", reason: "The exported message contains no text, structured content, or attachments." });
  const rawAuthor = source.sender ?? source.role ?? source.author;
  const author = record(rawAuthor)?.role ?? rawAuthor;
  return {
    message: {
      id: sourceMessageId || createId("message"), sourceMessageId, role: roleFromUnknown(author), content,
      createdAt: toIsoDate(source.created_at ?? source.createdAt ?? source.timestamp),
      updatedAt: toIsoDate(source.updated_at ?? source.updatedAt),
      parentMessageId: string(source.parent_message_uuid) || string(source.parentMessageId) || string(source.parent_id),
      model: string(source.model), authorName: string(source.author_name),
      attachmentIds: attachments.length ? attachments.map((attachment) => attachment.id) : undefined,
    },
    attachments,
  };
}

export const claudeAdapter: FormatAdapter = {
  id: "claude", displayName: "Claude",
  detect(input) {
    try {
      return isClaudeExport(JSON.parse(input.text))
        ? { supported: true, confidence: 0.92, reason: "Claude export fields" }
        : { supported: false, confidence: 0, reason: "No Claude export fields" };
    } catch { return { supported: false, confidence: 0, reason: "Not JSON" }; }
  },
  parse(input: ImportCandidate) {
    const data = JSON.parse(input.text) as ClaudeItem[];
    const warnings: ReturnType<FormatAdapter["parse"]>["warnings"] = [];
    const conversations = data.map((item) => {
      const sourceMessages = Array.isArray(item.chat_messages) ? item.chat_messages : Array.isArray(item.messages) ? item.messages : [];
      const parsed = sourceMessages.filter((message): message is ClaudeItem => Boolean(record(message))).map((message) => messageFromClaude(message, input));
      const messages = insertClaudeMissingPlaceholders(parsed.map(({ message }) => message.parentMessageId === CLAUDE_ROOT_UUID ? { ...message, parentMessageId: undefined } : message));
      const attachments = [...new Map(parsed.flatMap((result) => result.attachments).map((attachment) => [attachment.id, attachment])).values()];
      const emptyCount = messages.filter((message) => message.content.every((block) => block.type === "empty")).length;
      const unknownCount = messages.flatMap((message) => message.content).filter((block) => block.type === "unknown").length;
      if (emptyCount) warnings.push({ code: "EMPTY_MESSAGES_PRESERVED", message: `${emptyCount} empty messages were preserved.`, conversationId: string(item.uuid) });
      if (unknownCount) warnings.push({ code: "UNKNOWN_BLOCKS_PRESERVED", message: `${unknownCount} unsupported content blocks were preserved for diagnostics.`, conversationId: string(item.uuid) });
      return {
        id: createId("conversation"), provider: { id: "claude", name: "Claude", sourceFormat: "JSON" },
        metadata: { title: string(item.name) || string(item.title) || "Untitled conversation", createdAt: toIsoDate(item.created_at ?? item.createdAt), updatedAt: toIsoDate(item.updated_at ?? item.updatedAt), sourceConversationId: string(item.uuid) || string(item.id) },
        messages, attachments,
      };
    });
    return { conversations, warnings };
  },
};
