import { useMemo, useState } from "react";
import type { ConversationArchive, ImportWarning, UniversalConversation } from "./domain/conversation";
import { importFiles } from "./features/import/import-pipeline";
import { searchConversations } from "./features/search/search";
import { ImportDropzone } from "./components/ImportDropzone";
import { ConversationList } from "./components/ConversationList";
import { ConversationReader } from "./components/ConversationReader";

function chronological(conversations: UniversalConversation[]): UniversalConversation[] {
  return [...conversations].sort((a, b) => new Date(b.metadata.updatedAt ?? b.metadata.createdAt ?? 0).getTime() - new Date(a.metadata.updatedAt ?? a.metadata.createdAt ?? 0).getTime());
}

export default function App() {
  const [archive, setArchive] = useState<ConversationArchive>();
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const sorted = useMemo(() => chronological(archive?.conversations || []), [archive]);
  const matches = useMemo(() => searchConversations(sorted, query), [sorted, query]);
  const visible = sorted.filter((conversation) => matches.has(conversation.id));
  const selected = archive?.conversations.find((conversation) => conversation.id === selectedId) || visible[0];

  async function handleImport(files: File[]): Promise<void> {
    setImporting(true);
    const report = await importFiles(files);
    setArchive(report.archive);
    setWarnings(report.warnings);
    setErrors(report.errors);
    setSelectedId(report.archive.conversations[0]?.id);
    setQuery("");
    setImporting(false);
  }

  function clear(): void {
    archive?.conversations.flatMap((conversation) => conversation.attachments).forEach((attachment) => { if (attachment.objectUrl) URL.revokeObjectURL(attachment.objectUrl); });
    setArchive(undefined); setSelectedId(undefined); setWarnings([]); setErrors([]); setQuery("");
  }

  return <div className="app-shell">
    <header className="topbar">
      <div><a className="brand" href="/">archive-viewer</a><span>private AI export reader</span></div>
      {archive && <button type="button" className="quiet-button" onClick={clear}>Clear local session</button>}
    </header>
    {!archive ? <main className="welcome">
      <section className="hero"><p className="eyebrow">LOCAL-FIRST · OPEN FORMAT</p><h1>Your AI conversation history, readable on your device.</h1><p>Import exports from ChatGPT, Claude, and other JSON or Markdown sources. Nothing is uploaded or stored by this app.</p></section>
      <ImportDropzone disabled={importing} onFiles={(files) => void handleImport(files)} />
      <section className="privacy-grid"><article><h2>Private by default</h2><p>Files are processed in browser memory. Reload or clear the session to remove them.</p></article><article><h2>Platform-neutral</h2><p>Adapters translate providers into one portable conversation format.</p></article><article><h2>Shareable context</h2><p>Copy the currently selected branch with only the metadata you choose.</p></article></section>
      {(errors.length > 0 || warnings.length > 0) && <ImportFeedback errors={errors} warnings={warnings} />}
    </main> : <div className="workspace">
      <aside className="sidebar"><ImportDropzone disabled={importing} onFiles={(files) => void handleImport(files)} />
        <label className="search"><span>Search conversations</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title or message text" /></label>
        <p className="count">{visible.length} of {sorted.length} conversations</p>
        <ConversationList conversations={visible} selectedId={selected?.id} onSelect={setSelectedId} />
      </aside>
      <ConversationReader conversation={selected} />
      {(errors.length > 0 || warnings.length > 0) && <div className="feedback-float"><ImportFeedback errors={errors} warnings={warnings} /></div>}
    </div>}
  </div>;
}

function ImportFeedback({ errors, warnings }: { errors: string[]; warnings: ImportWarning[] }) {
  return <section className="import-feedback" aria-live="polite">
    {errors.map((error) => <p className="error" key={error}>{error}</p>)}
    {warnings.map((warning, index) => <p className="warning" key={`${warning.code}-${index}`}>{warning.message}</p>)}
  </section>;
}
