import { useEffect, useMemo, useState } from "react";
import type { UniversalConversation, UniversalMessage } from "../domain/conversation";
import { formatDate } from "../lib/dates";
import { MarkdownContent } from "./MarkdownContent";

function MessageBody({ message, conversation }: { message: UniversalMessage; conversation: UniversalConversation }) {
  return <>{message.content.map((block, index) => {
    if (block.type === "markdown") return <MarkdownContent key={index} markdown={block.markdown} attachments={conversation.attachments} />;
    if (block.type === "text") return <p key={index}>{block.text}</p>;
    if (block.type === "code") return <pre key={index}><code className={`language-${block.language || "markup"}`}>{block.code}</code></pre>;
    if (block.type === "image") {
      const attachment = conversation.attachments.find((item) => item.id === block.attachmentId);
      return attachment?.objectUrl ? <img key={index} className="message-image" src={attachment.objectUrl} alt={block.alt || attachment.name} /> : <p key={index}>Attachment: {attachment?.name || "missing"}</p>;
    }
    if (block.type === "file") return <p key={index}>Attached file: {conversation.attachments.find((item) => item.id === block.attachmentId)?.name || "missing"}</p>;
    return <details key={index}><summary>Unrecognised exported content</summary><pre>{JSON.stringify(block, null, 2)}</pre></details>;
  })}</>;
}

interface ConversationTree {
  childrenByParent: Map<string | undefined, UniversalMessage[]>;
  hasRelationships: boolean;
}

function byDateThenInput(a: UniversalMessage, b: UniversalMessage): number {
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.NaN;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.NaN;
  if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) return aTime - bTime;
  if (!Number.isNaN(aTime) && Number.isNaN(bTime)) return -1;
  if (Number.isNaN(aTime) && !Number.isNaN(bTime)) return 1;
  return 0;
}

export function buildConversationTree(messages: UniversalMessage[]): ConversationTree {
  const knownIds = new Set(messages.map((message) => message.id));
  const childrenByParent = new Map<string | undefined, UniversalMessage[]>();
  let hasRelationships = false;
  for (const message of messages) {
    const parentId = message.parentMessageId && knownIds.has(message.parentMessageId) ? message.parentMessageId : undefined;
    if (parentId) hasRelationships = true;
    const children = childrenByParent.get(parentId) || [];
    children.push(message);
    childrenByParent.set(parentId, children);
  }
  childrenByParent.forEach((children) => children.sort(byDateThenInput));
  return { childrenByParent, hasRelationships };
}

function visiblePath(tree: ConversationTree, selection: Record<string, string>): UniversalMessage[] {
  const path: UniversalMessage[] = [];
  let parentId: string | undefined;
  while (true) {
    const children = tree.childrenByParent.get(parentId) || [];
    if (!children.length) break;
    const selected = children.find((message) => message.id === selection[parentId || "root"]) || children.at(-1)!;
    path.push(selected);
    parentId = selected.id;
  }
  return path;
}

function BranchNavigator({ siblings, selectedId, onSelect }: { siblings: UniversalMessage[]; selectedId: string; onSelect: (id: string) => void }) {
  if (siblings.length < 2) return null;
  const index = siblings.findIndex((message) => message.id === selectedId);
  return <nav className="branch-navigator" aria-label="Message branch">
    <button type="button" aria-label="Previous version" disabled={index <= 0} onClick={() => onSelect(siblings[index - 1]!.id)}>‹</button>
    <span>{index + 1}/{siblings.length}</span>
    <button type="button" aria-label="Next version" disabled={index >= siblings.length - 1} onClick={() => onSelect(siblings[index + 1]!.id)}>›</button>
  </nav>;
}

export function ConversationReader({ conversation }: { conversation?: UniversalConversation }) {
  const tree = useMemo(() => buildConversationTree(conversation?.messages || []), [conversation]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  useEffect(() => setSelection({}), [conversation?.id]);
  if (!conversation) return <main className="reader empty-reader"><p>Import an export, then select a conversation to start reading.</p></main>;
  const messages = tree.hasRelationships ? visiblePath(tree, selection) : conversation.messages;
  return <main className="reader">
    <header className="reader-header">
      <p className="eyebrow">{conversation.provider.name}</p>
      <h1>{conversation.metadata.title}</h1>
      <p>{messages.length} displayed · {conversation.messages.length} total messages · {formatDate(conversation.metadata.updatedAt ?? conversation.metadata.createdAt)}</p>
    </header>
    <section className="messages" aria-label="Conversation messages">
      {messages.map((message) => {
        const siblings = tree.childrenByParent.get(message.parentMessageId && tree.childrenByParent.has(message.parentMessageId) ? message.parentMessageId : undefined) || [];
        const parentKey = message.parentMessageId && tree.childrenByParent.has(message.parentMessageId) ? message.parentMessageId : "root";
        return <article key={message.id} className={`message ${message.role}`}>
        <header><strong>{message.authorName || message.role}</strong><span className="message-header-actions"><BranchNavigator siblings={siblings} selectedId={message.id} onSelect={(id) => setSelection((current) => ({ ...current, [parentKey]: id }))} /><time>{formatDate(message.createdAt)}</time></span></header>
        <div className="message-body"><MessageBody message={message} conversation={conversation} /></div>
      </article>;
      })}
      {!messages.length && <p>No readable messages were found in this conversation.</p>}
    </section>
  </main>;
}
