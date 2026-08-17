import { useEffect, useMemo, useRef, useState } from "react";
import type { UniversalConversation, UniversalMessage } from "../domain/conversation";
import { formatDate } from "../lib/dates";
import { CONTINUATION_PROMPT, createConversationCopy, DEFAULT_COPY_OPTIONS, type ConversationCopyOptions } from "../features/export/create-conversation-copy";
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
  childrenByParent: Map<string, UniversalMessage[]>;
  roots: UniversalMessage[];
  detachedRootGroups: Array<{ parentMessageId: string; messages: UniversalMessage[] }>;
  hasRelationships: boolean;
}

const ROOT_SELECTION_KEY = "__conversation_root__";

function roleLabel(message: UniversalMessage): string {
  return message.role && message.role !== "unknown" ? message.role : "assistant";
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
  const childrenByParent = new Map<string, UniversalMessage[]>();
  const roots: UniversalMessage[] = [];
  const detachedByParent = new Map<string, UniversalMessage[]>();
  let hasRelationships = false;
  for (const message of messages) {
    if (message.parentMessageId && knownIds.has(message.parentMessageId)) {
      hasRelationships = true;
      const children = childrenByParent.get(message.parentMessageId) || [];
      children.push(message);
      childrenByParent.set(message.parentMessageId, children);
    } else if (!message.parentMessageId) {
      roots.push(message);
    } else {
      // Preserve the missing parent UUID: messages sharing it are real siblings,
      // but the group has no reliable position in the main timeline.
      const siblings = detachedByParent.get(message.parentMessageId) || [];
      siblings.push(message);
      detachedByParent.set(message.parentMessageId, siblings);
    }
  }
  childrenByParent.forEach((children) => children.sort(byDateThenInput));
  roots.sort(byDateThenInput);
  const detachedRootGroups = [...detachedByParent.entries()]
    .map(([parentMessageId, groupMessages]) => ({ parentMessageId, messages: groupMessages.sort(byDateThenInput) }))
    .sort((a, b) => byDateThenInput(a.messages[0]!, b.messages[0]!));
  return { childrenByParent, roots, detachedRootGroups, hasRelationships: hasRelationships || detachedRootGroups.length > 0 };
}

function visiblePath(tree: ConversationTree, roots: UniversalMessage[], rootSelectionKey: string, selection: Record<string, string>): UniversalMessage[] {
  const path: UniversalMessage[] = [];
  let siblings = roots;
  let selectionKey = rootSelectionKey;
  while (siblings.length) {
    const selected = siblings.find((message) => message.id === selection[selectionKey]) || siblings.at(-1)!;
    path.push(selected);
    siblings = tree.childrenByParent.get(selected.id) || [];
    selectionKey = selected.id;
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

export function ConversationReader({ conversation, onGoHome }: { conversation?: UniversalConversation; onGoHome?(): void }) {
  const tree = useMemo(() => buildConversationTree(conversation?.messages || []), [conversation]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [copyOptions, setCopyOptions] = useState<ConversationCopyOptions>(DEFAULT_COPY_OPTIONS);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [exportOpen, setExportOpen] = useState(false);
  const exportControl = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelection({}); setCopyStatus("idle"); setExportOpen(false); }, [conversation?.id]);
  useEffect(() => {
    if (!exportOpen) return undefined;
    const closeWhenOutside = (event: MouseEvent) => {
      if (!exportControl.current?.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    return () => document.removeEventListener("mousedown", closeWhenOutside);
  }, [exportOpen]);
  if (!conversation) return <main className="reader empty-reader"><p>Import an export, then select a conversation to start reading.</p></main>;
  const messages = tree.hasRelationships ? visiblePath(tree, tree.roots, ROOT_SELECTION_KEY, selection) : conversation.messages;
  const detachedCount = tree.detachedRootGroups.reduce((count, group) => count + group.messages.length, 0);
  const placeholderCount = conversation.messages.filter((message) => message.metadata?.missingFromExport === true).length;
  const selectBranch = (parentKey: string, id: string) => {
    setSelection((current) => ({ ...current, [parentKey]: id }));
    setCopyStatus("idle");
  };
  const renderPath = (path: UniversalMessage[], roots: UniversalMessage[], rootKey: string) => path.map((message, index) => {
    const isRoot = index === 0;
    const siblings = isRoot ? roots : tree.childrenByParent.get(message.parentMessageId || "") || [];
    const parentKey = isRoot ? rootKey : message.parentMessageId || rootKey;
    const isMissing = message.metadata?.missingFromExport === true;
    return <div key={message.id} className={`message-stack ${message.role}${isMissing ? " missing" : ""}`}>
      <strong className="message-role">{roleLabel(message)}</strong>
      <article className={`message ${message.role}${isMissing ? " missing" : ""}`}>
        <div className="message-body"><MessageBody message={message} conversation={conversation} /></div>
        {isMissing && <footer>Role and upstream position inferred from exported UUID relationships; content unavailable.</footer>}
      </article>
      <div className="message-branch-actions"><BranchNavigator siblings={siblings} selectedId={message.id} onSelect={(id) => selectBranch(parentKey, id)} /><time>{formatDate(message.createdAt)}</time></div>
    </div>;
  });
  const setCopyOption = (option: keyof ConversationCopyOptions, checked: boolean) => {
    setCopyOptions((current) => ({ ...current, [option]: checked }));
    setCopyStatus("idle");
  };
  const copyCurrentBranch = async () => {
    try {
      await navigator.clipboard.writeText(createConversationCopy(conversation, messages, copyOptions));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };
  return <main className="reader">
    <header className="reader-header">
      <div className="reader-title"><p className="eyebrow">{conversation.provider.name}</p><h1>{onGoHome ? <button type="button" className="reader-home-title" onClick={onGoHome} title="返回导入主页">{conversation.metadata.title}</button> : conversation.metadata.title}</h1><p>{messages.length} 条消息 · {formatDate(conversation.metadata.updatedAt ?? conversation.metadata.createdAt)}{detachedCount ? ` · ${detachedCount} 个断开片段` : ""}{placeholderCount ? ` · ${placeholderCount} 条缺失占位` : ""}</p></div>
      <div className="reader-actions">
        <div className="export-control" ref={exportControl}>
          <button className="quiet-button export-button" type="button" aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" /></svg>导出</button>
        {exportOpen && <section className="copy-panel" aria-label="导出当前对话分支">
          <div className="copy-panel-heading"><div><h2>复制当前分支</h2><p>只复制当前通过箭头选中的对话路径。</p></div><button className="copy-button" type="button" onClick={() => void copyCurrentBranch()}>{copyStatus === "copied" ? "已复制" : copyStatus === "error" ? "复制失败" : "复制对话"}</button></div>
          <fieldset>
            <legend>包含内容</legend>
            <label><input type="checkbox" checked={copyOptions.includeTitle} onChange={(event) => setCopyOption("includeTitle", event.target.checked)} /> 标题</label>
            <label><input type="checkbox" checked={copyOptions.includeRoles} onChange={(event) => setCopyOption("includeRoles", event.target.checked)} /> 角色</label>
            <label><input type="checkbox" checked={copyOptions.includeTimestamps} onChange={(event) => setCopyOption("includeTimestamps", event.target.checked)} /> 时间</label>
            <label><input type="checkbox" checked={copyOptions.includeModels} onChange={(event) => setCopyOption("includeModels", event.target.checked)} /> 模型</label>
            <label><input type="checkbox" checked={copyOptions.includeMissingPlaceholders} onChange={(event) => setCopyOption("includeMissingPlaceholders", event.target.checked)} /> 缺失消息占位</label>
            <label><input type="checkbox" checked={copyOptions.includeContinuationPrompt} onChange={(event) => setCopyOption("includeContinuationPrompt", event.target.checked)} /> 继续对话提示词</label>
          </fieldset>
          {copyOptions.includeContinuationPrompt && <details className="prompt-preview"><summary>预览继续对话提示词</summary><pre>{CONTINUATION_PROMPT}</pre></details>}
        </section>}
        </div>
      </div>
    </header>
    <section className="messages" aria-label="Conversation messages">
      {renderPath(messages, tree.roots, ROOT_SELECTION_KEY)}
      {!messages.length && <p>No readable messages were found in this conversation.</p>}
    </section>
    {tree.detachedRootGroups.length > 0 && <section className="detached-fragments" aria-label="Detached conversation fragments">
      <h2>Detached conversation fragments</h2>
      <p>The export references parent messages that are not present. These fragments retain their original sibling relationships without being assigned a guessed position.</p>
      {tree.detachedRootGroups.map((group, index) => {
        const rootKey = `__detached_${group.parentMessageId}`;
        const path = visiblePath(tree, group.messages, rootKey, selection);
        return <section className="detached-fragment" key={group.parentMessageId}>
          <h3>Fragment {index + 1}</h3>
          <article className="missing-parent-message">
            <strong>Parent message missing from export</strong>
            <p>This message is referenced by {group.messages.length} exported {group.messages.length === 1 ? "message" : "message versions"}, but its role and content are not present in the ZIP.</p>
            <code>{group.parentMessageId}</code>
          </article>
          {renderPath(path, group.messages, rootKey)}
        </section>;
      })}
    </section>}
  </main>;
}
