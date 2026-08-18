import JSZip from "jszip";
import type { ArchiveSection, UniversalConversation, UniversalMessage } from "../../domain/conversation";
import { createConversationExport, DEFAULT_EXPORT_OPTIONS, type ConversationExportOptions } from "./create-conversation-copy";

export interface ArchiveExportOptions { includeProfile: boolean; includeMemories: boolean; }
export const DEFAULT_ARCHIVE_EXPORT_OPTIONS: ArchiveExportOptions = { includeProfile: true, includeMemories: true };

function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "conversation";
}

function markdown(conversation: UniversalConversation, messages: UniversalMessage[], options: ConversationExportOptions = DEFAULT_EXPORT_OPTIONS): string {
  return createConversationExport(conversation, messages, {
    ...options,
    includeTimestamps: true,
    includeModels: true,
  });
}

export function archiveSectionsMarkdown(sections: ArchiveSection[], options: ArchiveExportOptions): string {
  const included = sections.filter((section) => (section.kind === "profile" && options.includeProfile) || (section.kind === "memories" && options.includeMemories));
  return included.flatMap((section) => [
    `# ${section.title || section.kind}`,
    ...section.items.flatMap((item, index) => [`## ${item.title || `Item ${index + 1}`}`, item.body || "", item.fields ? Object.entries(item.fields).map(([key, value]) => `- ${key}: ${value}`).join("\n") : ""]),
  ]).filter(Boolean).join("\n\n");
}

export function createExportText(conversation: UniversalConversation, messages: UniversalMessage[], exportOptions: ConversationExportOptions, sections: ArchiveSection[], archiveOptions: ArchiveExportOptions): string {
  return [markdown(conversation, messages, exportOptions).trim(), archiveSectionsMarkdown(sections, archiveOptions)].filter(Boolean).join("\n\n---\n\n") + "\n";
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadConversationMarkdown(conversation: UniversalConversation, messages: UniversalMessage[], exportOptions = DEFAULT_EXPORT_OPTIONS, sections: ArchiveSection[] = [], archiveOptions = DEFAULT_ARCHIVE_EXPORT_OPTIONS): void {
  download(new Blob([createExportText(conversation, messages, exportOptions, sections, archiveOptions)], { type: "text/markdown;charset=utf-8" }), `${safeFilename(conversation.metadata.title)}.md`);
}

export async function downloadConversationsZip(conversations: UniversalConversation[], sections: ArchiveSection[] = [], archiveOptions = DEFAULT_ARCHIVE_EXPORT_OPTIONS): Promise<void> {
  const zip = new JSZip();
  const used = new Map<string, number>();
  conversations.forEach((conversation) => {
    const base = safeFilename(conversation.metadata.title);
    const count = (used.get(base) || 0) + 1; used.set(base, count);
    zip.file(`${base}${count > 1 ? ` (${count})` : ""}.md`, markdown(conversation, conversation.messages));
  });
  const context = archiveSectionsMarkdown(sections, archiveOptions);
  if (context) zip.file("Profile and memories.md", `${context}\n`);
  download(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), "conversation-archive.zip");
}
