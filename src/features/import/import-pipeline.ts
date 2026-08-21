import JSZip from "jszip";
import { detectAdapter } from "../../adapters/registry";
import type { ImportCandidate } from "../../adapters/adapter";
import { ConversationArchiveSchema, type ArchiveSection, type ConversationArchive, type ImportWarning, type UniversalConversation } from "../../domain/conversation";
import { hasReadableConversationContent } from "../../domain/conversation-content";
import { IMPORT_LIMITS } from "./import-limits";
import { annotateArchiveSectionSources, extractArchiveSections, mergeArchiveSections } from "./archive-sections";
import { chatGptArchiveSections, chatGptLibraryConversation } from "../../adapters/chatgpt-archive";

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

/** Consolidate preservation notices when an import contains multiple provider files. */
export function consolidateImportWarnings(warnings: ImportWarning[]): ImportWarning[] {
  const mergeableCodes = new Set(["EMPTY_MESSAGES_PRESERVED", "UNKNOWN_BLOCKS_PRESERVED"]);
  const merged: ImportWarning[] = [];
  const positions = new Map<string, number>();
  for (const warning of warnings) {
    if (!mergeableCodes.has(warning.code) || warning.count === undefined) { merged.push(warning); continue; }
    const position = positions.get(warning.code);
    if (position === undefined) {
      positions.set(warning.code, merged.length);
      merged.push({ ...warning });
      continue;
    }
    const current = merged[position]!;
    const count = (current.count || 0) + warning.count;
    const conversationCount = (current.conversationCount || 0) + (warning.conversationCount || 0);
    const description = warning.code === "EMPTY_MESSAGES_PRESERVED"
      ? `${count} empty messages were preserved across ${conversationCount} conversations.`
      : `${count} unsupported content blocks were preserved across ${conversationCount} conversations for diagnostics.`;
    merged[position] = { ...current, count, conversationCount, message: description };
  }
  const emptyMessageConversationCount = merged
    .filter((warning) => warning.code === "EMPTY_MESSAGES_PRESERVED")
    .reduce((count, warning) => count + (warning.conversationCount || 0), 0);
  return merged.filter((warning) => {
    if (warning.code !== "EMPTY_CONVERSATIONS_PRESERVED") return true;
    // The two notices describe the same set when their conversation counts match.
    // Keep this notice for genuinely separate empty conversations.
    return Number(warning.message) !== emptyMessageConversationCount;
  });
}

function isSupportedTextFile(name: string): boolean {
  return /\.(json|md|markdown|html?)$/i.test(name);
}

function isAttachment(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|pdf|txt|mp4|mov|webm)$/i.test(name)
    || /\/prod-mc-asset-server\/\/[^/]+\/content$/i.test(name)
    || !name.split("/").pop()?.includes(".");
}

function isChatGptShard(name: string): boolean {
  return /(?:^|\/)conversations-\d+\.json$/i.test(name);
}

function isChatGptPackage(entries: Array<{ name: string }>): boolean {
  return entries.some((entry) => isChatGptShard(entry.name));
}

function isChatGptCandidate(name: string): boolean {
  return isChatGptShard(name) || /(?:^|\/)user\.json$/i.test(name)
    || (/\.json$/i.test(name) && !/(?:^|\/)conversation_asset_file_names\.json$/i.test(name));
}

function isChatGptAttachment(name: string): boolean {
  return /(?:^|\/)file[-_][^/]+\.dat$/i.test(name);
}

function sharedChatGptConversationIds(candidate: ImportCandidate): string[] {
  if (!/(?:^|\/)shared_conversations\.json$/i.test(candidate.name)) return [];
  try {
    const parsed = JSON.parse(candidate.text);
    return Array.isArray(parsed) ? parsed.flatMap((value) => value && typeof value === "object" && typeof (value as Record<string, unknown>).conversation_id === "string"
      ? [(value as Record<string, unknown>).conversation_id as string] : []) : [];
  } catch { return []; }
}

function markSharedChatGptConversations(conversations: UniversalConversation[], sharedIds: Set<string>): UniversalConversation[] {
  if (!sharedIds.size) return conversations;
  return conversations.map((conversation) => conversation.provider.id === "chatgpt" && conversation.metadata.sourceConversationId && sharedIds.has(conversation.metadata.sourceConversationId)
    ? { ...conversation, metadata: { ...conversation.metadata, extra: { ...conversation.metadata.extra, chatgptShared: true } } }
    : conversation);
}

function assetNamesFromJson(text: string): Map<string, string> {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    return new Map(Object.entries(parsed).flatMap(([path, name]) => typeof name === "string" ? [[path, name] as const] : []));
  } catch {
    return new Map();
  }
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

export { hasReadableConversationContent } from "../../domain/conversation-content";

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
  const chatGptPackage = isChatGptPackage(entries);
  const relevantEntries = chatGptPackage
    ? entries.filter((entry) => isChatGptCandidate(entry.name) || isChatGptAttachment(entry.name) || /(?:^|\/)conversation_asset_file_names\.json$/i.test(entry.name))
    : entries;
  const attachments = new Map<string, File>();
  let uncompressedBytes = 0;

  for (const entry of relevantEntries) {
    if (!safePath(entry.name)) {
      errors.push(`${entry.name}: unsafe archive path skipped.`);
      continue;
    }
    // JSZip does not expose the central-directory size in its public TypeScript type.
    const internalEntry = entry as unknown as { _data?: { uncompressedSize?: number } };
    const size = internalEntry._data?.uncompressedSize ?? 0;
    uncompressedBytes += size;
    if (uncompressedBytes > IMPORT_LIMITS.maxZipUncompressedBytes) return { candidates: [], errors: ["ZIP exceeds the uncompressed safety limit."] };
    if (isAttachment(entry.name) || (chatGptPackage && isChatGptAttachment(entry.name))) {
      const blob = await entry.async("blob");
      attachments.set(entry.name, new File([blob], entry.name.split("/").pop() || entry.name, { type: blob.type }));
    }
  }

  const assetNameEntry = chatGptPackage ? relevantEntries.find((entry) => /(?:^|\/)conversation_asset_file_names\.json$/i.test(entry.name)) : undefined;
  const attachmentNames = assetNameEntry ? assetNamesFromJson(await assetNameEntry.async("text")) : undefined;

  const candidates: ImportCandidate[] = [];
  const candidateEntries = chatGptPackage
    ? relevantEntries.filter((entry) => isChatGptCandidate(entry.name))
    : entries.filter((entry) => isSupportedTextFile(entry.name));
  for (const entry of candidateEntries.filter((item) => safePath(item.name))) {
    const text = await entry.async("text");
    candidates.push({
      name: entry.name, text, attachments, attachmentNames,
      providerHint: chatGptPackage && !isChatGptShard(entry.name) && !/(?:^|\/)user\.json$/i.test(entry.name) ? "chatgpt-archive" : undefined,
    });
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
  const sharedChatGptIds = new Set<string>();
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
        if (candidate.providerHint === "chatgpt-archive") {
          sharedChatGptConversationIds(candidate).forEach((id) => sharedChatGptIds.add(id));
          const extractedSections = chatGptArchiveSections(candidate);
          sections = mergeArchiveSections(sections, extractedSections);
          const library = chatGptLibraryConversation(candidate, new Set(conversations.flatMap((conversation) => conversation.attachments.map((attachment) => attachment.id))));
          if (library) conversations.push(library);
          continue;
        }
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
  const markedConversations = markSharedChatGptConversations(conversations, sharedChatGptIds);
  const providerIds = [...new Set(markedConversations.map((conversation) => conversation.provider.id).filter((id) => id !== "generic"))];
  if (providerIds.length === 1) sections = annotateArchiveSectionSources(sections, providerIds[0]);
  const archive = ConversationArchiveSchema.parse({ schemaVersion: "1.0", sourceFiles, conversations: markedConversations, sections });
  return { archive, warnings: consolidateImportWarnings(warnings), errors, sourceType, account };
}

/** Backwards-compatible convenience entrypoint for regular file selection. */
export function importFiles(files: File[]): Promise<ImportReport> {
  return importEntries(files.map((file) => ({ file })), "files");
}
