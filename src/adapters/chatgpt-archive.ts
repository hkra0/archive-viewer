import type { ImportCandidate } from "./adapter";
import { attachmentFromFile } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";
import type { ArchiveRecord, ArchiveSection, UniversalAttachment, UniversalConversation } from "../domain/conversation";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function basename(path: string): string {
  return path.split("/").at(-1) || path;
}

/** Export files may include browser/session secrets. Preserve useful data, never credentials. */
export function sanitiseChatGptData(value: unknown): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitiseChatGptData);
  const source = record(value);
  if (!source) return String(value);
  const result: JsonRecord = {};
  for (const [key, nested] of Object.entries(source)) {
    if (/(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|password|secret|session[_-]?token)/i.test(key)) continue;
    result[key] = sanitiseChatGptData(nested);
  }
  return result;
}

function item(value: unknown, fallbackId: string, title?: string, fields?: Record<string, string>): ArchiveRecord {
  const source = record(value) || {};
  return {
    id: string(source.id) || string(source.file_id) || fallbackId,
    title,
    raw: sanitiseChatGptData(value),
    fields: fields && Object.keys(fields).length ? fields : undefined,
    createdAt: toIsoDate(source.created_at ?? source.create_time ?? source.file_upload_time),
    updatedAt: toIsoDate(source.updated_at ?? source.modified_at),
  };
}

function section(id: string, title: string, items: ArchiveRecord[], kind: ArchiveSection["kind"] = "other"): ArchiveSection[] {
  return items.length ? [{ id, kind, title, providerId: "chatgpt", items }] : [];
}

const legacyOtherSectionIds = new Set([
  "chatgpt-settings", "chatgpt-export-manifest", "chatgpt-ads",
]);

/** Gives imports created by older releases the same compact supplemental-data UI. */
export function normaliseChatGptArchiveSections(sections: ArchiveSection[]): ArchiveSection[] {
  const current = sections.map((section) => section.id === "chatgpt-library" && section.kind !== "library" ? { ...section, kind: "library" as const } : section);
  const legacy = current.filter((section) => legacyOtherSectionIds.has(section.id));
  const legacyShared = current.filter((section) => section.id === "chatgpt-shared-conversations");
  if (!legacy.length && !legacyShared.length) return current;
  const legacyItems = legacy.flatMap((section) => section.items.map((archiveItem) => {
    if (archiveItem.raw !== undefined || !archiveItem.body) return archiveItem;
    try { return { ...archiveItem, body: undefined, raw: JSON.parse(archiveItem.body) }; } catch { return archiveItem; }
  }));
  const existing = current.find((section) => section.id === "chatgpt-other");
  if (!legacy.length && !existing) return current.filter((section) => section.id !== "chatgpt-shared-conversations");
  const other: ArchiveSection = existing
    ? { ...existing, items: [...existing.items, ...legacyItems] }
    : { id: "chatgpt-other", kind: "other", title: "其他内容", providerId: "chatgpt", items: legacyItems };
  const position = legacy.length ? Math.min(...legacy.map((section) => current.indexOf(section)), existing ? current.indexOf(existing) : Number.MAX_SAFE_INTEGER) : current.length;
  const retained = current.filter((section) => !legacyOtherSectionIds.has(section.id) && section.id !== "chatgpt-other" && section.id !== "chatgpt-shared-conversations");
  return [...retained.slice(0, position), other, ...retained.slice(position)];
}

export function isChatGptSupplementalFile(name: string): boolean {
  return /(?:^|\/)(?:library_files|shared_conversations|user_settings|export_manifest|ads)\.json$/i.test(name);
}

/** Converts non-conversation records in a current ChatGPT export into existing archive sections. */
export function chatGptArchiveSections(candidate: ImportCandidate): ArchiveSection[] {
  let parsed: unknown;
  try { parsed = JSON.parse(candidate.text); } catch { return []; }
  const name = basename(candidate.name).toLowerCase();
  if (name === "library_files.json" && Array.isArray(parsed)) {
    return section("chatgpt-library", "ChatGPT Library", parsed.map((value, index) => {
      const source = record(value) || {};
      return item(value, `library-${index}`, string(source.file_name) || string(source.name) || `Library file ${index + 1}`, {
        Type: string(source.mime_type) || string(source.file_extension) || "Unknown",
        ...(string(source.state) && string(source.state)?.toLowerCase() !== "ready" ? { Status: string(source.state)! } : {}),
        "File ID": string(source.file_id) || "Unknown",
        ...(string(source.origination_thread_id) ? { "Conversation ID": string(source.origination_thread_id)! } : {}),
      });
    }), "library");
  }
  if (name === "shared_conversations.json") return [];
  if (name === "user_settings.json") return section("chatgpt-other", "其他内容", [item(parsed, "chatgpt-settings", "设置与偏好（已保留）")]);
  if (name === "export_manifest.json") {
    const source = record(parsed) || {};
    const files = Array.isArray(source.files) ? source.files.length : undefined;
    return section("chatgpt-other", "其他内容", [item(parsed, "chatgpt-export-manifest", "导出清单", {
      ...(string(source.version) ? { Version: string(source.version)! } : {}),
      ...(files !== undefined ? { Files: String(files) } : {}),
    })]);
  }
  if (name === "ads.json") return section("chatgpt-other", "其他内容", [item(parsed, "chatgpt-ads", "广告数据（已保留）")]);
  return section("chatgpt-other", "其他内容", [item(parsed, `chatgpt-${name}`, basename(candidate.name))]);
}

function attachmentFile(input: ImportCandidate, id: string): [string, File] | undefined {
  return [...(input.attachments?.entries() || [])].find(([path, file]) =>
    path.endsWith(`/${id}.dat`) || path === `${id}.dat` || file.name === `${id}.dat`,
  );
}

/**
 * Library files that are not already attached to a conversation use a virtual
 * conversation, reusing the existing attachment preview/download UI and store.
 */
export function chatGptLibraryConversation(candidate: ImportCandidate, knownAttachmentIds: Set<string>): UniversalConversation | undefined {
  if (!/(?:^|\/)library_files\.json$/i.test(candidate.name)) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(candidate.text); } catch { return undefined; }
  if (!Array.isArray(parsed)) return undefined;
  const attachments: UniversalAttachment[] = [];
  const messages: UniversalConversation["messages"] = [];
  for (const value of parsed) {
    const source = record(value);
    const fileId = string(source?.file_id);
    if (!source || !fileId || knownAttachmentIds.has(fileId)) continue;
    const found = attachmentFile(candidate, fileId);
    if (!found) continue;
    const name = string(source.file_name) || candidate.attachmentNames?.get(found[0]) || basename(found[0]);
    const base = attachmentFromFile(found[1], found[0]);
    const attachment: UniversalAttachment = {
      ...base,
      id: fileId,
      name,
      mimeType: string(source.mime_type) || base.mimeType,
      size: typeof source.file_size_bytes === "number" ? source.file_size_bytes : base.size,
      createdAt: toIsoDate(source.created_at ?? source.file_upload_time),
      metadata: { chatgptLibrary: sanitiseChatGptData(source) as Record<string, unknown> },
    };
    attachments.push(attachment);
    messages.push({
      id: `library-${fileId}`, sourceMessageId: `library-${fileId}`, role: "tool",
      content: [/^image\//.test(attachment.mimeType || "") ? { type: "image" as const, attachmentId: attachment.id, alt: attachment.name } : { type: "file" as const, attachmentId: attachment.id }],
      createdAt: attachment.createdAt,
      attachmentIds: [attachment.id],
      metadata: { chatgptLibraryFile: true },
    });
  }
  if (!attachments.length) return undefined;
  return {
    id: createId("conversation"),
    provider: { id: "chatgpt", name: "ChatGPT", sourceFormat: "library_files.json" },
    metadata: { title: "ChatGPT Library files", sourceConversationId: "chatgpt-library", extra: { chatgptLibrary: true } },
    messages,
    attachments,
  };
}
