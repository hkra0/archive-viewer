import JSZip from "jszip";
import { detectAdapter } from "../../adapters/registry";
import type { ImportCandidate } from "../../adapters/adapter";
import { ConversationArchiveSchema, type ConversationArchive, type ImportWarning, type UniversalConversation } from "../../domain/conversation";
import { IMPORT_LIMITS } from "./import-limits";

export interface ImportReport {
  archive: ConversationArchive;
  warnings: ImportWarning[];
  errors: string[];
}

function isSupportedTextFile(name: string): boolean {
  return /\.(json|md|markdown)$/i.test(name);
}

function isAttachment(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|pdf|txt)$/i.test(name);
}

function fileCandidate(file: File, text: string, attachments?: Map<string, File>): ImportCandidate {
  return { name: file.name, text, mimeType: file.type || undefined, attachments };
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

async function candidatesFromZip(file: File): Promise<{ candidates: ImportCandidate[]; errors: string[] }> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const errors: string[] = [];
  if (entries.length > IMPORT_LIMITS.maxZipEntries) return { candidates: [], errors: ["ZIP has too many entries."] };
  const attachments = new Map<string, File>();
  let uncompressedBytes = 0;

  for (const entry of entries) {
    // JSZip normalises paths; reject unexpected absolute path-like names as a defence in depth measure.
    if (entry.name.startsWith("/") || entry.name.includes("../")) {
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
  for (const entry of entries.filter((item) => isSupportedTextFile(item.name))) {
    const text = await entry.async("text");
    candidates.push({ name: entry.name, text, attachments });
  }
  return { candidates, errors };
}

/** Reads files entirely in the browser. It never calls fetch or writes persistent storage. */
export async function importFiles(files: File[]): Promise<ImportReport> {
  const warnings: ImportWarning[] = [];
  const errors: string[] = [];
  const conversations: UniversalConversation[] = [];
  const sourceFiles = files.map((file) => ({ name: file.name, size: file.size, mimeType: file.type || undefined, lastModified: file.lastModified }));

  if (files.length > IMPORT_LIMITS.maxFiles) errors.push(`Only the first ${IMPORT_LIMITS.maxFiles} files can be imported at once.`);
  for (const file of files.slice(0, IMPORT_LIMITS.maxFiles)) {
    if (file.size > IMPORT_LIMITS.maxFileBytes) {
      errors.push(`${file.name}: file exceeds the ${IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB safety limit.`);
      continue;
    }
    try {
      const candidates = /\.zip$/i.test(file.name)
        ? await candidatesFromZip(file)
        : { candidates: [fileCandidate(file, await file.text())], errors: [] };
      errors.push(...candidates.errors);
      for (const candidate of candidates.candidates) {
        const result = parseCandidate(candidate);
        conversations.push(...result.conversations);
        warnings.push(...result.warnings);
        if (result.error) errors.push(result.error);
      }
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : "Could not read file."}`);
    }
  }
  const archive = ConversationArchiveSchema.parse({ schemaVersion: "1.0", sourceFiles, conversations });
  return { archive, warnings, errors };
}
