import type { MessageContentBlock, UniversalMessage } from "../../domain/conversation";

function normaliseText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trimEnd();
}

function stableValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(normaliseText(value));
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableValue(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function stableBlock(block: MessageContentBlock): unknown {
  if (block.type === "markdown") return { type: block.type, markdown: normaliseText(block.markdown) };
  if (block.type === "text") return { type: block.type, text: normaliseText(block.text) };
  if (block.type === "code") return { type: block.type, code: normaliseText(block.code), language: block.language || "" };
  if (block.type === "image") return { type: block.type, attachmentId: block.attachmentId, alt: block.alt || "" };
  if (block.type === "file") return { type: block.type, attachmentId: block.attachmentId };
  if (block.type === "tool-call") return { type: block.type, name: block.name, input: block.input };
  if (block.type === "tool-result") return { type: block.type, name: block.name || "", output: block.output };
  return { type: block.type, raw: block.raw };
}

/** Exact, normalised payload used in addition to the short hash to avoid hash-only comparisons. */
export function messagePayloadKey(message: Pick<UniversalMessage, "role" | "content">): string {
  return stableValue({ role: message.role, content: message.content.map(stableBlock) });
}

/** A deterministic non-cryptographic hash suitable for local IDs; comparisons still use payload keys. */
export function hashPayload(payload: string): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x27d4eb2d);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function contentHash(message: Pick<UniversalMessage, "role" | "content">): string {
  return hashPayload(messagePayloadKey(message));
}

export function withMessageIdentity(message: UniversalMessage, importBatchId?: string): UniversalMessage {
  return {
    ...message,
    sourceMessageId: message.sourceMessageId,
    contentHash: contentHash(message),
    importBatchId: importBatchId || message.importBatchId,
  };
}
