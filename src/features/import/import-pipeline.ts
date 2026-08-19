import JSZip from "jszip";
import { detectAdapter } from "../../adapters/registry";
import type { ImportCandidate } from "../../adapters/adapter";
import { ConversationArchiveSchema, type ArchiveSection, type ConversationArchive, type ImportWarning, type MessageContentBlock, type UniversalConversation } from "../../domain/conversation";
import { IMPORT_LIMITS } from "./import-limits";
import { annotateArchiveSectionSources, extractArchiveSections, mergeArchiveSections } from "./archive-sections";

export type ImportSourceType = "zip" | "folder" | "files";

export interface ImportEntry {
  file: File;
  /** Relative path from a folder selection or an archive. */
  path?: string;
}

export interface ImportedAccountProfile {
  displayName?: string;
  email?: string;
}

export interface ImportReport {
  archive: ConversationArchive;
  warnings: ImportWarning[];
  errors: string[];
  sourceType: ImportSourceType;
  account?: ImportedAccountProfile;
}

function isSupportedTextFile(name: string): boolean {
  return /\.(json|md|markdown|html?)$/i.test(name);
}

function isAttachment(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|pdf|txt|mp4|mov|webm)$/i.test(name)
    || /\/prod-mc-asset-server\/\/[^/]+\/content$/i.test(name)
    || !name.split("/").pop()?.includes(".");
}

function safePath(path: string): boolean {
  return !path.startsWith("/") && !path.includes("../") && !path.includes("\\");
}

function fileCandidate(file: File, text: string, attachments?: Map<string, File>, name = file.name): ImportCandidate {
  return { name, text, mimeType: file.type || undefined, attachments };
}

function parseCandidate(candidate: ImportCandidate): { conversations: UniversalConversation[]; warnings: ImportWarning[]; error?: string } {
  const detected = detectAdapter(candidate);
  if (!detected) return { conversations: [], warnings: [], error: `${candidate.name}: unsupported format.` };
  try {
    const result = detected.adapter.parse(candidate);
    return { conversations: result.conversations, warnings: result.warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parser error";
    return { conversations: [], warnings: [], error: `${candidate.name}: ${message}` };
  }
}

function isReadableBlock(block: MessageContentBlock): boolean {
  if (block.type === "text") return Boolean(block.text.trim());
  if (block.type === "markdown") return Boolean(block.markdown.trim());
  if (block.type === "code") return Boolean(block.code.trim());
  if (block.type === "thinking") return Boolean(block.thinking.trim());
  if (block.type === "tool-call" || block.type === "tool-result") return true;
  return block.type === "image" || block.type === "file";
}

/** Empty containers and adapter fallbacks must not become conversations in the archive. */
export function hasReadableConversationContent(conversation: UniversalConversation): boolean {
  return conversation.messages.some((message) => message.content.some(isReadableBlock));
}

function firstString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) if (typeof value[key] === "string" && value[key].trim()) return value[key].trim() as string;
  return undefined;
}

function accountProfileFromCandidate(candidate: ImportCandidate): ImportedAccountProfile | undefined {
  if (!/(?:^|\/)(?:account|users?|profile|user[_-]?info)(?:[._-]|$)/i.test(candidate.name)) return undefined;
  try {
    const parsed = JSON.parse(candidate.text) as unknown;
    const root = Array.isArray(parsed) ? parsed.find((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))) : parsed;
    if (!root || typeof root !== "object" || Array.isArray(root)) return undefined;
    const record = root as Record<string, unknown>;
    const nested = [record, record.account, record.user, record.profile, record.data].filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)));
    for (const value of nested) {
      const email = firstString(value, ["email", "email_address", "emailAddress"]);
      const displayName = firstString(value, ["display_name", "displayName", "name", "full_name", "fullName", "username"]);
      if (email || displayName) return { email, displayName };
    }
  } catch {
    // A profile-looking filename may still contain unrelated JSON; let adapters handle it.
  }
  return undefined;
}

function isAccountOnlyCandidate(candidate: ImportCandidate, account?: ImportedAccountProfile): boolean {
  if (!account) return false;
  try {
    const parsed = JSON.parse(candidate.text) as unknown;
    if (Array.isArray(parsed)) return true;
    if (!parsed || typeof parsed !== "object") return false;
    const root = parsed as Record<string, unknown>;
    return !("mapping" in root || "messages" in root || "conversations" in root || "chat_messages" in root || "chats" in root);
  } catch {
    return false;
  }
}

function combineAccountProfile(current: ImportedAccountProfile | undefined, incoming: ImportedAccountProfile | undefined): ImportedAccountProfile | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  return { displayName: current.displayName || incoming.displayName, email: current.email || incoming.email };
}

function accountProfileFromSections(sections: ArchiveSection[]): ImportedAccountProfile | undefined {
  const profile = sections.find((section) => section.kind === "profile")?.items[0]?.fields;
  if (!profile) return undefined;
  const displayName = profile.Name || profile.Username;
  const email = profile.Email;
  return displayName || email ? { displayName, email } : undefined;
}

async function candidatesFromZip(file: File): Promise<{ candidates: ImportCandidate[]; errors: string[] }> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const errors: string[] = [];
  if (entries.length > IMPORT_LIMITS.maxZipEntries) return { candidates: [], errors: ["ZIP has too many entries."] };
  const attachments = new Map<string, File>();
  let uncompressedBytes = 0;

  for (const entry of entries) {
    if (!safePath(entry.name)) {
      errors.push(`${entry.name}: unsafe archive path skipped.`);
      continue;
    }
    // JSZip does not expose the central-directory size in its public TypeScript type.
    const internalEntry = entry as unknown as { _data?: { uncompressedSize?: number } };
    const size = internalEntry._data?.uncompressedSize ?? 0;
    uncompressedBytes += size;
    if (uncompressedBytes > IMPORT_LIMITS.maxZipUncompressedBytes) return { candidates: [], errors: ["ZIP exceeds the uncompressed safety limit."] };
    if (isAttachment(entry.name)) {
      const blob = await entry.async("blob");
      attachments.set(entry.name, new File([blob], entry.name.split("/").pop() || entry.name, { type: blob.type }));
    }
  }

  const candidates: ImportCandidate[] = [];
  for (const entry of entries.filter((item) => safePath(item.name) && isSupportedTextFile(item.name))) {
    const text = await entry.async("text");
    candidates.push({ name: entry.name, text, attachments });
  }
  return { candidates, errors };
}

function folderAttachments(entries: ImportEntry[]): Map<string, File> {
  const attachments = new Map<string, File>();
  entries.forEach(({ file, path }) => {
    const sourcePath = path || file.name;
    if (isAttachment(sourcePath) && safePath(sourcePath)) attachments.set(sourcePath, file);
  });
  return attachments;
}

/** Reads files entirely in the browser. It never calls fetch or writes persistent storage. */
export async function importEntries(entries: ImportEntry[], selectionType: Exclude<ImportSourceType, "zip"> = "files"): Promise<ImportReport> {
  const warnings: ImportWarning[] = [];
  const errors: string[] = [];
  const conversations: UniversalConversation[] = [];
  let sections: ArchiveSection[] = [];
  const sourceFiles = entries.map(({ file, path }) => ({ name: path || file.name, size: file.size, mimeType: file.type || undefined, lastModified: file.lastModified }));
  const scopedEntries = entries.slice(0, IMPORT_LIMITS.maxFiles);
  const directAttachments = folderAttachments(scopedEntries);
  let account: ImportedAccountProfile | undefined;
  let preservedEmptyConversations = 0;
  const sourceType: ImportSourceType = entries.some(({ file }) => /\.zip$/i.test(file.name)) ? "zip" : selectionType;

  if (entries.length > IMPORT_LIMITS.maxFiles) errors.push(`Only the first ${IMPORT_LIMITS.maxFiles} files can be imported at once.`);
  let totalBytes = 0;
  for (const { file, path } of scopedEntries) {
    const sourcePath = path || file.name;
    if (!safePath(sourcePath)) {
      errors.push(`${sourcePath}: unsafe path skipped.`);
      continue;
    }
    const fileLimit = /\.zip$/i.test(file.name) ? IMPORT_LIMITS.maxTotalFileBytes : IMPORT_LIMITS.maxFileBytes;
    if (file.size > fileLimit) {
      errors.push(`${sourcePath}: file exceeds the ${fileLimit / 1024 / 1024} MB safety limit.`);
      continue;
    }
    totalBytes += file.size;
    if (totalBytes > IMPORT_LIMITS.maxTotalFileBytes) {
      errors.push(`Selected files exceed the ${IMPORT_LIMITS.maxTotalFileBytes / 1024 / 1024} MB total safety limit.`);
      break;
    }
    try {
      const candidates = /\.zip$/i.test(file.name)
        ? await candidatesFromZip(file)
        : isSupportedTextFile(sourcePath)
          ? { candidates: [fileCandidate(file, await file.text(), directAttachments, sourcePath)], errors: [] }
          : { candidates: [], errors: [] };
      errors.push(...candidates.errors);
      for (const candidate of candidates.candidates) {
        const extractedSections = extractArchiveSections(candidate);
        sections = mergeArchiveSections(sections, extractedSections);
        const profile = accountProfileFromCandidate(candidate);
        account = combineAccountProfile(account, combineAccountProfile(profile, accountProfileFromSections(extractedSections)));
        if (isAccountOnlyCandidate(candidate, profile)) continue;
        const result = parseCandidate(candidate);
        preservedEmptyConversations += result.conversations.filter((conversation) => !hasReadableConversationContent(conversation)).length;
        conversations.push(...result.conversations);
        warnings.push(...result.warnings);
        if (result.error && !extractedSections.length) errors.push(result.error);
      }
    } catch (error) {
      errors.push(`${sourcePath}: ${error instanceof Error ? error.message : "Could not read file."}`);
    }
  }
  if (preservedEmptyConversations) warnings.push({ code: "EMPTY_CONVERSATIONS_PRESERVED", message: String(preservedEmptyConversations) });
  const providerIds = [...new Set(conversations.map((conversation) => conversation.provider.id).filter((id) => id !== "generic"))];
  if (providerIds.length === 1) sections = annotateArchiveSectionSources(sections, providerIds[0]);
  const archive = ConversationArchiveSchema.parse({ schemaVersion: "1.0", sourceFiles, conversations, sections });
  return { archive, warnings, errors, sourceType, account };
}

/** Backwards-compatible convenience entrypoint for regular file selection. */
export function importFiles(files: File[]): Promise<ImportReport> {
  return importEntries(files.map((file) => ({ file })), "files");
}
