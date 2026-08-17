import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

interface ImportDropzoneProps {
  disabled?: boolean;
  onFiles(files: File[]): void;
}

export function ImportDropzone({ disabled, onFiles }: ImportDropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function accept(files: FileList | null): void {
    if (files?.length) onFiles(Array.from(files));
  }
  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    accept(event.target.files);
    event.target.value = "";
  }
  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    if (!disabled) accept(event.dataTransfer.files);
  }

  return <div
    className={`dropzone ${dragging ? "is-dragging" : ""}`}
    role="button"
    tabIndex={0}
    aria-label="Choose or drop archive files"
    onClick={() => !disabled && input.current?.click()}
    onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) input.current?.click(); }}
    onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={() => setDragging(false)}
    onDrop={onDrop}
  >
    <input ref={input} type="file" multiple accept=".zip,.json,.md,.markdown" onChange={onChange} hidden />
    <span className="dropzone-icon" aria-hidden="true">↥</span>
    <strong>{disabled ? "Importing files…" : "Drop AI exports here"}</strong>
    <span>ZIP, JSON, or Markdown · processed locally in this browser</span>
    <button type="button" disabled={disabled}>Choose files</button>
  </div>;
}
