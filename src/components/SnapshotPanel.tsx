import { useEffect, useState } from "react";
import type { UniversalConversation } from "../domain/conversation";
import { createSnapshot } from "../features/snapshot/create-snapshot";
import { downloadText } from "../lib/download";

export function SnapshotPanel({ conversation }: { conversation?: UniversalConversation }) {
  const [snapshot, setSnapshot] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setSnapshot(conversation ? createSnapshot(conversation) : ""); setCopied(false); }, [conversation]);
  if (!conversation) return <aside className="snapshot-panel"><h2>Context Snapshot</h2><p>Select a conversation to create a local snapshot.</p></aside>;
  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(snapshot);
    setCopied(true);
  }
  return <aside className="snapshot-panel">
    <div><h2>Context Snapshot</h2><p>Generated locally. Review before sharing it with another AI.</p></div>
    <textarea aria-label="Editable context snapshot" value={snapshot} onChange={(event) => setSnapshot(event.target.value)} />
    <div className="snapshot-actions">
      <button type="button" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>
      <button type="button" onClick={() => downloadText("context-snapshot.md", snapshot)}>Download .md</button>
    </div>
  </aside>;
}
