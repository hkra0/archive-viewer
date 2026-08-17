import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ImportEntry } from "../features/import/import-pipeline";

export interface ImportSelection {
  entries: ImportEntry[];
  sourceType: "files" | "folder";
}

interface ImportDropzoneProps {
  compact?: boolean;
  disabled?: boolean;
  onImport(selection: ImportSelection): void;
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

async function droppedEntries(event: DragEvent<HTMLElement>): Promise<ImportSelection> {
  const items = Array.from(event.dataTransfer.items) as unknown as WebkitDataTransferItem[];
  const webkitEntries = items.map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is WebkitEntry => Boolean(entry));
  const hasFolder = webkitEntries.some((entry) => entry.isDirectory);
  if (webkitEntries.length) {
    const entries = await Promise.all(webkitEntries.map((entry) => entry.isDirectory ? readDirectoryEntry(entry) : readFileEntry(entry)));
    return { entries: entries.flat(), sourceType: hasFolder ? "folder" : "files" };
  }
  return { entries: relativeEntries(event.dataTransfer.files), sourceType: "files" };
}

export function ImportDropzone({ compact, disabled, onImport }: ImportDropzoneProps) {
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const chooserRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => { folderInput.current?.setAttribute("webkitdirectory", ""); }, []);
  useEffect(() => {
    const closeWhenOutside = (event: MouseEvent) => {
      if (!chooserRef.current?.contains(event.target as Node)) setChooserOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    return () => document.removeEventListener("mousedown", closeWhenOutside);
  }, []);

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
    setDragging(false);
    if (disabled) return;
    try {
      const selection = await droppedEntries(event);
      if (selection.entries.length) onImport(selection);
    } catch {
      // Reading a folder can be blocked by the browser. The file picker remains available.
    }
  }

  if (compact) return <div className="compact-import" ref={chooserRef}>
    <input ref={filesInput} type="file" multiple accept=".zip,.json,.md,.markdown" onChange={onFileChange} hidden />
    <input ref={folderInput} type="file" multiple onChange={onFolderChange} hidden />
    <button type="button" className="new-import-button" disabled={disabled} aria-expanded={chooserOpen} onClick={() => setChooserOpen((open) => !open)}><span aria-hidden="true">＋</span>{disabled ? "正在导入…" : "导入对话"}</button>
    {chooserOpen && <div className="import-choice-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { setChooserOpen(false); filesInput.current?.click(); }}>导入文件</button>
      <button type="button" role="menuitem" onClick={() => { setChooserOpen(false); folderInput.current?.click(); }}>导入文件夹</button>
    </div>}
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
    <button type="button" className="dropzone-icon" disabled={disabled} aria-label="选择要导入的文件" onClick={() => filesInput.current?.click()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" /></svg>
    </button>
    <strong>{disabled ? "正在导入…" : "导入你的对话记录"}</strong>
    <span>点击图标选择文件，或拖入 ZIP、JSON、Markdown 和文件夹；文件仅在本地处理。</span>
  </section>;
}
