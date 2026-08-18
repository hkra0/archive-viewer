import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ImportEntry } from "../features/import/import-pipeline";
import { Icon } from "./Icons";
import { useI18n } from "../lib/i18n";

export interface ImportSelection {
  entries: ImportEntry[];
  sourceType: "files" | "folder";
}

interface ImportDropzoneProps {
  compact?: boolean;
  disabled?: boolean;
  onImport(selection: ImportSelection): void;
  onOpenImportHome?(): void;
}

interface WebkitEntry {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  file?(success: (file: File) => void, failure?: (error: DOMException) => void): void;
  createReader?(): { readEntries(success: (entries: WebkitEntry[]) => void, failure?: (error: DOMException) => void): void };
}

type WebkitDataTransferItem = { webkitGetAsEntry?: () => WebkitEntry | null };
type RelativeFile = File & { webkitRelativePath?: string };

function relativeEntries(files: FileList | null): ImportEntry[] {
  return Array.from(files || []).map((file) => ({ file, path: (file as RelativeFile).webkitRelativePath || file.name }));
}

function readFileEntry(entry: WebkitEntry): Promise<ImportEntry> {
  return new Promise((resolve, reject) => {
    if (!entry.file) { reject(new DOMException("无法读取文件。")); return; }
    entry.file((file) => resolve({ file, path: entry.fullPath.replace(/^\//, "") }), reject);
  });
}

async function readDirectoryEntry(entry: WebkitEntry): Promise<ImportEntry[]> {
  const reader = entry.createReader?.();
  if (!reader) return [];
  const children: WebkitEntry[] = [];
  while (true) {
    const page = await new Promise<WebkitEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!page.length) break;
    children.push(...page);
  }
  const nested = await Promise.all(children.map((child) => child.isDirectory ? readDirectoryEntry(child) : readFileEntry(child)));
  return nested.flat();
}

export async function droppedEntries(dataTransfer: DataTransfer): Promise<ImportSelection> {
  const items = Array.from(dataTransfer.items) as unknown as WebkitDataTransferItem[];
  const webkitEntries = items.map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is WebkitEntry => Boolean(entry));
  const hasFolder = webkitEntries.some((entry) => entry.isDirectory);
  if (webkitEntries.length) {
    const entries = await Promise.all(webkitEntries.map((entry) => entry.isDirectory ? readDirectoryEntry(entry) : readFileEntry(entry)));
    return { entries: entries.flat(), sourceType: hasFolder ? "folder" : "files" };
  }
  return { entries: relativeEntries(dataTransfer.files), sourceType: "files" };
}

export function ImportDropzone({ compact, disabled, onImport, onOpenImportHome }: ImportDropzoneProps) {
  const { t } = useI18n();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { folderInput.current?.setAttribute("webkitdirectory", ""); }, []);

  function submit(files: FileList | null, sourceType: "files" | "folder"): void {
    const entries = relativeEntries(files);
    if (entries.length) onImport({ entries, sourceType });
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    submit(event.target.files, "files");
    event.target.value = "";
  }

  function onFolderChange(event: ChangeEvent<HTMLInputElement>): void {
    submit(event.target.files, "folder");
    event.target.value = "";
  }

  async function onDrop(event: DragEvent<HTMLElement>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    if (disabled) return;
    try {
      const selection = await droppedEntries(event.dataTransfer);
      if (selection.entries.length) onImport(selection);
    } catch {
      // Reading a folder can be blocked by the browser. The file picker remains available.
    }
  }

  if (compact) return <div className="compact-import">
    <button type="button" className="new-import-button" disabled={disabled} onClick={onOpenImportHome}><Icon name="import" />{disabled ? t("importing") : t("import")}</button>
  </div>;

  return <section
    className={`dropzone${compact ? " compact" : ""}${dragging ? " is-dragging" : ""}`}
    aria-label="导入对话文件"
    onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => void onDrop(event)}
  >
    <input ref={filesInput} type="file" multiple accept=".zip,.json,.md,.markdown" onChange={onFileChange} hidden />
    <input ref={folderInput} type="file" multiple onChange={onFolderChange} hidden />
    <span className="dropzone-icon"><Icon name="import" /></span>
    <strong>{disabled ? t("importing") : t("importTitle")}</strong>
    <span>{t("importHint")}</span>
    <div className="import-actions">
      <button type="button" className="primary-button" disabled={disabled} onClick={() => filesInput.current?.click()}>{t("importFile")}</button>
      <button type="button" className="text-button" disabled={disabled} onClick={() => folderInput.current?.click()}>{t("importFolder")}</button>
    </div>
  </section>;
}
