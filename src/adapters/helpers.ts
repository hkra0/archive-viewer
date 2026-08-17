import type { MessageContentBlock, MessageRole, UniversalAttachment, UniversalMessage } from "../domain/conversation";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";

export function roleFromUnknown(value: unknown): MessageRole {
  const role = typeof value === "string" ? value.toLowerCase() : "";
  if (["system", "user", "assistant", "tool"].includes(role)) return role as MessageRole;
  if (["human", "prompt"].includes(role)) return "user";
  if (["ai", "bot", "model"].includes(role)) return "assistant";
  return "unknown";
}

export function blocksFromUnknown(value: unknown): MessageContentBlock[] {
  if (typeof value === "string") return [{ type: "markdown", markdown: value }];
  if (Array.isArray(value)) {
    const text = value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") return item.text;
      return "";
    }).filter(Boolean).join("\n\n");
    if (text) return [{ type: "markdown", markdown: text }];
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["text", "content", "parts"]) {
      if (key in object) return blocksFromUnknown(object[key]);
    }
  }
  return [{ type: "unknown", raw: value }];
}

export function makeMessage(source: Record<string, unknown>): UniversalMessage {
  const content = source.content ?? source.text ?? source.parts ?? source.message ?? "";
  const rawAuthor = source.role ?? source.sender ?? source.author;
  const author = rawAuthor && typeof rawAuthor === "object" ? (rawAuthor as Record<string, unknown>).role : rawAuthor;
  return {
    id: createId("message"),
    role: roleFromUnknown(author),
    content: blocksFromUnknown(content),
    createdAt: toIsoDate(source.created_at ?? source.createdAt ?? source.timestamp ?? source.time),
    model: typeof source.model === "string" ? source.model : undefined,
    authorName: typeof source.author_name === "string" ? source.author_name : undefined,
  };
}

export function attachmentFromFile(file: File, sourcePath: string): UniversalAttachment {
  return {
    id: createId("attachment"),
    name: file.name,
    mimeType: file.type || undefined,
    size: file.size,
    sourcePath,
    objectUrl: URL.createObjectURL(file),
  };
}
