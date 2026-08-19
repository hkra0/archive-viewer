import { useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveSection, UniversalConversation, UniversalMessage } from "../domain/conversation";
import { formatDate } from "../lib/dates";
import { continuationPromptForLocale, DEFAULT_EXPORT_OPTIONS, type ConversationExportOptions } from "../features/export/create-conversation-copy";
import { createExportText, DEFAULT_ARCHIVE_EXPORT_OPTIONS, downloadConversationMarkdown, downloadConversationsZip } from "../features/export/downloads";
import { MarkdownContent } from "./MarkdownContent";
import { useI18n } from "../lib/i18n";
import type { ExportPreferences } from "../features/groups/group-types";
import { Icon } from "./Icons";

const DEFAULT_CONVERSATION_ARCHIVE_OPTIONS = { includeProfile: false, includeMemories: false };

function exportOptionsForLocale(options: Partial<ConversationExportOptions> | undefined, locale: "zh-CN" | "en"): ConversationExportOptions {
  return {
    ...DEFAULT_EXPORT_OPTIONS,
    ...options,
    continuationPrompt: options?.continuationPrompt || continuationPromptForLocale(locale),
  };
}

function hasEditedContinuationPrompt(options: Partial<ConversationExportOptions> | undefined, locale: "zh-CN" | "en"): boolean {
  return Boolean(options?.continuationPrompt && options.continuationPrompt !== continuationPromptForLocale(locale));
}

function storedConversationExportOptions(preferences: ExportPreferences | undefined): Partial<ConversationExportOptions> | undefined {
  return preferences?.conversationExportOptions ?? preferences?.conversationCopyOptions;
}

function MessageBody({ message, conversation }: { message: UniversalMessage; conversation: UniversalConversation }) {
  const { locale, t } = useI18n();
  return <>{message.content.map((block, index) => {
    if (block.type === "markdown") return <MarkdownContent key={index} markdown={block.markdown} attachments={conversation.attachments} />;
    if (block.type === "text") return <p key={index}>{block.text}</p>;
    if (block.type === "code") return <pre key={index}><code className={`language-${block.language || "markup"}`}>{block.code}</code></pre>;
    if (block.type === "image") {
      const attachment = conversation.attachments.find((item) => item.id === block.attachmentId);
      return attachment?.objectUrl ? <img key={index} className="message-image" src={attachment.objectUrl} alt={block.alt || attachment.name} /> : <p key={index}>{t("importedAttachment")}: {attachment?.name || t("unknownDate")}</p>;
    }
    if (block.type === "file") {
      const attachment = conversation.attachments.find((item) => item.id === block.attachmentId);
      return <details className="structured-block attachment-block" key={index}><summary>📎 {attachment?.name || "Missing attachment"}{attachment?.size ? ` · ${Math.ceil(attachment.size / 1024)} KB` : ""}</summary>{attachment?.textContent && <pre><code>{attachment.textContent}</code></pre>}{attachment?.objectUrl && <a href={attachment.objectUrl} download={attachment.name}>{locale === "zh-CN" ? "下载附件" : "Download attachment"}</a>}</details>;
    }
    if (block.type === "thinking") return <details className="structured-block thinking-block" key={index}><summary>{locale === "zh-CN" ? "思考过程" : "Thinking"}{block.summaries?.length ? ` — ${block.summaries.join("；")}` : ""}</summary><pre>{block.thinking}</pre></details>;
    if (block.type === "tool-call") return <details className="structured-block tool-block" key={index}><summary>🔧 {locale === "zh-CN" ? "工具调用" : "Tool call"}: {block.name}</summary><pre><code>{JSON.stringify(block.input, null, 2)}</code></pre></details>;
    if (block.type === "tool-result") return <details className={`structured-block tool-block${block.isError ? " error" : ""}`} key={index}><summary>↩ {locale === "zh-CN" ? "工具结果" : "Tool result"}{block.name ? `: ${block.name}` : ""}{block.isError ? ` (${locale === "zh-CN" ? "错误" : "error"})` : ""}</summary><pre><code>{typeof block.output === "string" ? block.output : JSON.stringify(block.output, null, 2)}</code></pre></details>;
    if (block.type === "empty") return <p className="empty-message" key={index}>⚠ {block.reason || (locale === "zh-CN" ? "导出数据中的这条消息为空。" : "This message is empty in the exported data.")}</p>;
    return <details className="structured-block unknown-block" key={index}><summary>⚠ {locale === "zh-CN" ? "暂不支持的内容块（已保留）" : "Unsupported content block (preserved)"}</summary><pre><code>{JSON.stringify(block.raw, null, 2)}</code></pre></details>;
  })}</>;
}

interface ConversationTree {
  childrenByParent: Map<string, UniversalMessage[]>;
  roots: UniversalMessage[];
  detachedRootGroups: Array<{ parentMessageId: string; messages: UniversalMessage[] }>;
  hasRelationships: boolean;
}

const ROOT_SELECTION_KEY = "__conversation_root__";

function searchableMessageText(message: UniversalMessage): string {
  return message.content.map((block) => {
    if (block.type === "markdown") return block.markdown;
    if (block.type === "text") return block.text;
    if (block.type === "code") return block.code;
    if (block.type === "thinking") return `${block.summaries?.join(" ") || ""} ${block.thinking}`;
    if (block.type === "tool-call") return `${block.name} ${JSON.stringify(block.input)}`;
    if (block.type === "tool-result") return `${block.name || ""} ${typeof block.output === "string" ? block.output : JSON.stringify(block.output)}`;
    return "";
  }).join(" ");
}

export function messageClipboardText(message: UniversalMessage, conversation: UniversalConversation): string {
  const attachmentName = (attachmentId: string) => conversation.attachments.find((attachment) => attachment.id === attachmentId)?.name || attachmentId;
  const serialise = (value: unknown) => JSON.stringify(value, null, 2) || "";
  return message.content.map((block) => {
    if (block.type === "markdown") return block.markdown;
    if (block.type === "text") return block.text;
    if (block.type === "code") return block.code;
    if (block.type === "image") return block.alt || attachmentName(block.attachmentId);
    if (block.type === "file") return attachmentName(block.attachmentId);
    if (block.type === "thinking") return block.thinking;
    if (block.type === "tool-call") return `${block.name}\n${serialise(block.input)}`.trim();
    if (block.type === "tool-result") return `${block.name || ""}\n${typeof block.output === "string" ? block.output : serialise(block.output)}`.trim();
    if (block.type === "empty") return block.reason || "";
    return serialise(block.raw);
  }).filter(Boolean).join("\n\n");
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
  const { t } = useI18n();
  if (siblings.length < 2) return null;
  const index = siblings.findIndex((message) => message.id === selectedId);
  return <nav className="branch-navigator" aria-label={t("messageBranch")}>
    <button type="button" aria-label={t("previousVersion")} disabled={index <= 0} onClick={() => onSelect(siblings[index - 1]!.id)}>‹</button>
    <span>{index + 1}/{siblings.length}</span>
    <button type="button" aria-label={t("nextVersion")} disabled={index >= siblings.length - 1} onClick={() => onSelect(siblings[index + 1]!.id)}>›</button>
  </nav>;
}

export function ConversationReader({ conversation, allConversations = [], archiveSections = [], selectedConversationIds = [], exportPreferences, onExportPreferencesChange, onGoHome }: { conversation?: UniversalConversation; allConversations?: UniversalConversation[]; archiveSections?: ArchiveSection[]; selectedConversationIds?: string[]; exportPreferences?: ExportPreferences; onExportPreferencesChange?(preferences: ExportPreferences): void; onGoHome?(): void }) {
  const { locale, t } = useI18n();
  const tree = useMemo(() => buildConversationTree(conversation?.messages || []), [conversation]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [exportOptions, setExportOptions] = useState<ConversationExportOptions>(() => exportOptionsForLocale(storedConversationExportOptions(exportPreferences), locale));
  const [continuationPromptEdited, setContinuationPromptEdited] = useState(() => hasEditedContinuationPrompt(storedConversationExportOptions(exportPreferences), locale));
  const [conversationArchiveOptions, setConversationArchiveOptions] = useState(() => exportPreferences?.conversationArchiveOptions || DEFAULT_CONVERSATION_ARCHIVE_OPTIONS);
  const [groupArchiveOptions, setGroupArchiveOptions] = useState(() => exportPreferences?.groupArchiveOptions || DEFAULT_ARCHIVE_EXPORT_OPTIONS);
  const [exportTab, setExportTab] = useState<"conversation" | "group">("conversation");
  const [groupExportScope, setGroupExportScope] = useState<"selected" | "unselected" | "all">(() => exportPreferences?.groupExportScope || "all");
  const [exportStatus, setExportStatus] = useState<"idle" | "copied" | "error">("idle");
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const [failedMessageId, setFailedMessageId] = useState<string>();
  const [exportOpen, setExportOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const exportControl = useRef<HTMLDivElement>(null);
  const messageElements = useRef(new Map<string, HTMLElement>());
  const exportPreferencesRef = useRef<ExportPreferences | undefined>(exportPreferences);
  useEffect(() => { setSelection({}); setExportStatus("idle"); setCopiedMessageId(undefined); setFailedMessageId(undefined); setExportOpen(false); setMessageQuery(""); setSearchIndex(0); messageElements.current.clear(); }, [conversation?.id]);
  useEffect(() => {
    exportPreferencesRef.current = exportPreferences;
    setExportOptions(exportOptionsForLocale(storedConversationExportOptions(exportPreferences), locale));
    setContinuationPromptEdited(hasEditedContinuationPrompt(storedConversationExportOptions(exportPreferences), locale));
    setConversationArchiveOptions(exportPreferences?.conversationArchiveOptions || DEFAULT_CONVERSATION_ARCHIVE_OPTIONS);
    setGroupArchiveOptions(exportPreferences?.groupArchiveOptions || DEFAULT_ARCHIVE_EXPORT_OPTIONS);
    setGroupExportScope(exportPreferences?.groupExportScope || "all");
  }, [exportPreferences, locale]);
  useEffect(() => {
    if (!continuationPromptEdited) setExportOptions((current) => ({ ...current, continuationPrompt: continuationPromptForLocale(locale) }));
  }, [locale, continuationPromptEdited]);
  useEffect(() => {
    if (!exportOpen) return undefined;
    const closeWhenOutside = (event: MouseEvent) => {
      if (!exportControl.current?.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    return () => document.removeEventListener("mousedown", closeWhenOutside);
  }, [exportOpen]);
  if (!conversation) return <main className="reader empty-reader"><p>{t("noReadableMessages")}</p></main>;
  const messages = tree.hasRelationships ? visiblePath(tree, tree.roots, ROOT_SELECTION_KEY, selection) : conversation.messages;
  const normalisedQuery = messageQuery.trim().toLocaleLowerCase(locale);
  const searchHits = normalisedQuery ? messages.filter((message) => searchableMessageText(message).toLocaleLowerCase(locale).includes(normalisedQuery)) : [];
  const currentHit = searchHits[Math.min(searchIndex, Math.max(0, searchHits.length - 1))];
  const moveToHit = (delta: number) => {
    if (!searchHits.length) return;
    const next = (searchIndex + delta + searchHits.length) % searchHits.length;
    setSearchIndex(next);
    messageElements.current.get(searchHits[next]!.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const detachedCount = tree.detachedRootGroups.reduce((count, group) => count + group.messages.length, 0);
  const placeholderCount = conversation.messages.filter((message) => message.metadata?.missingFromExport === true).length;
  const selectBranch = (parentKey: string, id: string) => {
    setSelection((current) => ({ ...current, [parentKey]: id }));
    setExportStatus("idle");
  };
  const renderPath = (path: UniversalMessage[], roots: UniversalMessage[], rootKey: string) => path.map((message, index) => {
    const isRoot = index === 0;
    const siblings = isRoot ? roots : tree.childrenByParent.get(message.parentMessageId || "") || [];
    const parentKey = isRoot ? rootKey : message.parentMessageId || rootKey;
    const isMissing = message.metadata?.missingFromExport === true;
    const isHit = searchHits.some((hit) => hit.id === message.id);
    return <div key={message.id} ref={(element) => { if (element) messageElements.current.set(message.id, element); else messageElements.current.delete(message.id); }} className={`message-stack ${message.role}${isMissing ? " missing" : ""}${isHit ? " search-hit" : ""}${currentHit?.id === message.id ? " current-search-hit" : ""}`}>
      <strong className="message-role">{t(`role_${message.role}`)}</strong>
      <article className={`message ${message.role}${isMissing ? " missing" : ""}`}>
        <div className="message-body"><MessageBody message={message} conversation={conversation} /></div>
        {isMissing && <footer>{t("inferredMissing")}</footer>}
      </article>
      <div className="message-branch-actions"><button className="quiet-button message-copy-button" type="button" onClick={() => void copyMessage(message)} aria-label={copiedMessageId === message.id ? t("copied") : failedMessageId === message.id ? t("copyFailed") : t("copyMessage")} title={copiedMessageId === message.id ? t("copied") : failedMessageId === message.id ? t("copyFailed") : t("copyMessage")}><Icon name="copy" /></button><BranchNavigator siblings={siblings} selectedId={message.id} onSelect={(id) => selectBranch(parentKey, id)} /><time>{formatDate(message.createdAt, locale, t("unknownDate"))}</time></div>
    </div>;
  });
  const persistPreferences = (next: ExportPreferences) => { exportPreferencesRef.current = next; onExportPreferencesChange?.(next); };
  const setExportOption = (option: Exclude<keyof ConversationExportOptions, "continuationPrompt">, checked: boolean) => {
    setExportOptions((current) => { const next = { ...current, [option]: checked }; const { conversationCopyOptions: _legacy, ...preferences } = exportPreferencesRef.current || {}; persistPreferences({ ...preferences, conversationExportOptions: next }); return next; });
    setExportStatus("idle");
  };
  const setContinuationPrompt = (continuationPrompt: string) => {
    setExportOptions((current) => { const next = { ...current, continuationPrompt }; const { conversationCopyOptions: _legacy, ...preferences } = exportPreferencesRef.current || {}; persistPreferences({ ...preferences, conversationExportOptions: next }); return next; });
    setContinuationPromptEdited(continuationPrompt !== continuationPromptForLocale(locale));
    setExportStatus("idle");
  };
  const setConversationArchiveOption = (option: "includeProfile" | "includeMemories", checked: boolean) => setConversationArchiveOptions((current) => { const next = { ...current, [option]: checked }; persistPreferences({ ...exportPreferencesRef.current, conversationArchiveOptions: next }); return next; });
  const setGroupArchiveOption = (option: "includeProfile" | "includeMemories", checked: boolean) => setGroupArchiveOptions((current) => { const next = { ...current, [option]: checked }; persistPreferences({ ...exportPreferencesRef.current, groupArchiveOptions: next }); return next; });
  const setPersistedGroupExportScope = (scope: "selected" | "unselected" | "all") => { setGroupExportScope(scope); persistPreferences({ ...exportPreferencesRef.current, groupExportScope: scope }); };
  const exportCurrentBranchToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(createExportText(conversation, messages, exportOptions, archiveSections, conversationArchiveOptions));
      setExportStatus("copied");
    } catch {
      setExportStatus("error");
    }
  };
  const copyMessage = async (message: UniversalMessage) => {
    try {
      await navigator.clipboard.writeText(messageClipboardText(message, conversation));
      setCopiedMessageId(message.id);
      setFailedMessageId(undefined);
    } catch {
      setFailedMessageId(message.id);
      setCopiedMessageId(undefined);
    }
  };
  return <main className="reader">
    <div className="reader-actions">
      <div className="conversation-search" role="search">
        <input value={messageQuery} onChange={(event) => { setMessageQuery(event.target.value); setSearchIndex(0); }} onKeyDown={(event) => { if (event.key === "Enter") moveToHit(event.shiftKey ? -1 : 1); }} placeholder={locale === "zh-CN" ? "在当前对话中搜索" : "Search this conversation"} />
        <span>{messageQuery ? `${searchHits.length ? Math.min(searchIndex + 1, searchHits.length) : 0}/${searchHits.length}` : ""}</span>
        <button type="button" disabled={!searchHits.length} onClick={() => moveToHit(-1)} aria-label="Previous match">↑</button><button type="button" disabled={!searchHits.length} onClick={() => moveToHit(1)} aria-label="Next match">↓</button>
      </div>
      <div className="export-control" ref={exportControl}>
        <button className="quiet-button export-button" type="button" aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" /></svg>{t("export")}</button>
      {exportOpen && <section className="export-panel" aria-label={t("export")}>
        <div className="export-tabs" role="tablist" aria-label={t("export")}><button type="button" role="tab" aria-selected={exportTab === "conversation"} className={exportTab === "conversation" ? "active" : ""} onClick={() => setExportTab("conversation")}>{t("exportConversation")}</button><button type="button" role="tab" aria-selected={exportTab === "group"} className={exportTab === "group" ? "active" : ""} onClick={() => setExportTab("group")}>{t("exportGroup")}</button></div>
        {exportTab === "conversation" ? <>
          <div className="export-panel-heading"><div><h2>{t("exportBranch")}</h2><p>{t("exportBranchHint")}</p></div></div>
          <fieldset><legend>{t("include")}</legend>
            <label><input type="checkbox" checked={exportOptions.includeTitle} onChange={(event) => setExportOption("includeTitle", event.target.checked)} /> {t("title")}</label><label><input type="checkbox" checked={exportOptions.includeRoles} onChange={(event) => setExportOption("includeRoles", event.target.checked)} /> {t("roles")}</label><label><input type="checkbox" checked={exportOptions.includeTimestamps} onChange={(event) => setExportOption("includeTimestamps", event.target.checked)} /> {t("timestamps")}</label><label><input type="checkbox" checked={exportOptions.includeModels} onChange={(event) => setExportOption("includeModels", event.target.checked)} /> {t("models")}</label><label><input type="checkbox" checked={exportOptions.includeMissingPlaceholders} onChange={(event) => setExportOption("includeMissingPlaceholders", event.target.checked)} /> {t("missingPlaceholders")}</label><label><input type="checkbox" checked={exportOptions.includeContinuationPrompt} onChange={(event) => setExportOption("includeContinuationPrompt", event.target.checked)} /> {t("continuation")}</label><label><input type="checkbox" checked={conversationArchiveOptions.includeProfile} onChange={(event) => setConversationArchiveOption("includeProfile", event.target.checked)} /> {t("profile")}</label><label><input type="checkbox" checked={conversationArchiveOptions.includeMemories} onChange={(event) => setConversationArchiveOption("includeMemories", event.target.checked)} /> {t("memories")}</label>
          </fieldset>
          {exportOptions.includeContinuationPrompt && <div className="continuation-prompt">
            <div className="continuation-prompt-heading"><label htmlFor="continuation-prompt">{t("continuation")}</label><button type="button" className="text-button" onClick={() => setContinuationPrompt(continuationPromptForLocale(locale))}>{t("restoreDefault")}</button></div>
            <textarea id="continuation-prompt" value={exportOptions.continuationPrompt} onChange={(event) => setContinuationPrompt(event.target.value)} rows={6} spellCheck={false} />
          </div>}
          <div className="export-actions"><button className="copy-button export-action" type="button" onClick={() => void exportCurrentBranchToClipboard()}><Icon name="copy" />{exportStatus === "copied" ? t("copied") : exportStatus === "error" ? t("copyFailed") : t("copyConversation")}</button><button type="button" className="quiet-button export-action" onClick={() => downloadConversationMarkdown(conversation, messages, exportOptions, archiveSections, conversationArchiveOptions)}><Icon name="download" />{t("downloadMarkdown")}</button></div>
        </> : <>
          <div className="export-panel-heading"><div><h2>{t("exportGroup")}</h2><p>{t("exportGroupHint")}</p></div></div>
          <fieldset><legend>{t("exportScope")}</legend><label><input type="radio" name="group-export-scope" checked={groupExportScope === "all"} onChange={() => setPersistedGroupExportScope("all")} /> {t("exportAll")}</label><label><input type="radio" name="group-export-scope" checked={groupExportScope === "selected"} onChange={() => setPersistedGroupExportScope("selected")} /> {t("exportSelected", { count: selectedConversationIds.length })}</label><label><input type="radio" name="group-export-scope" checked={groupExportScope === "unselected"} onChange={() => setPersistedGroupExportScope("unselected")} /> {t("exportUnselected", { count: allConversations.length - selectedConversationIds.length })}</label></fieldset>
          <fieldset><legend>{t("include")}</legend><label><input type="checkbox" checked={groupArchiveOptions.includeProfile} onChange={(event) => setGroupArchiveOption("includeProfile", event.target.checked)} /> {t("profile")}</label><label><input type="checkbox" checked={groupArchiveOptions.includeMemories} onChange={(event) => setGroupArchiveOption("includeMemories", event.target.checked)} /> {t("memories")}</label></fieldset>
          <div className="export-actions"><button type="button" className="quiet-button export-action" disabled={(groupExportScope === "selected" && !selectedConversationIds.length) || (groupExportScope === "unselected" && selectedConversationIds.length === allConversations.length)} onClick={() => void downloadConversationsZip(groupExportScope === "selected" ? allConversations.filter((item) => selectedConversationIds.includes(item.id)) : groupExportScope === "unselected" ? allConversations.filter((item) => !selectedConversationIds.includes(item.id)) : allConversations, archiveSections, groupArchiveOptions)}><Icon name="download" />{t("downloadZip")}</button></div>
        </>}
      </section>}
      </div>
    </div>
    <header className="reader-header">
      <div className="reader-title"><p className="eyebrow">{conversation.provider.name}</p><h1>{onGoHome ? <button type="button" className="reader-home-title" onClick={onGoHome} aria-label={`${t("backHome")}: ${conversation.metadata.title}`} title={conversation.metadata.title}>{conversation.metadata.title}</button> : <span className="reader-conversation-title" title={conversation.metadata.title}>{conversation.metadata.title}</span>}</h1><p>{messages.length} {t("messages")} · {formatDate(conversation.metadata.updatedAt ?? conversation.metadata.createdAt, locale, t("unknownDate"))}{detachedCount ? ` · ${detachedCount}` : ""}{placeholderCount ? ` · ${placeholderCount}` : ""}</p></div>
    </header>
    <section className="messages" aria-label={t("messages")}>
      {messages.filter((message) => message.role === "user").length > 1 && <nav className="message-jump-nav" aria-label={locale === "zh-CN" ? "提问导航" : "Prompt navigation"}>{messages.filter((message) => message.role === "user").map((message, index) => <button key={message.id} type="button" title={searchableMessageText(message).slice(0, 160)} onClick={() => messageElements.current.get(message.id)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{index + 1}</button>)}</nav>}
      {renderPath(messages, tree.roots, ROOT_SELECTION_KEY)}
      {!messages.length && <p>{t("noReadableMessages")}</p>}
    </section>
    {tree.detachedRootGroups.length > 0 && <section className="detached-fragments" aria-label={t("detachedFragments")}>
      <h2>{t("detachedFragments")}</h2><p>{t("detachedHint")}</p>
      {tree.detachedRootGroups.map((group, index) => {
        const rootKey = `__detached_${group.parentMessageId}`;
        const path = visiblePath(tree, group.messages, rootKey, selection);
        return <section className="detached-fragment" key={group.parentMessageId}>
          <h3>{t("fragment", { count: index + 1 })}</h3>
          <article className="missing-parent-message">
            <strong>{t("missingParent")}</strong><p>{t("missingParentHint", { count: group.messages.length })}</p>
            <code>{group.parentMessageId}</code>
          </article>
          {renderPath(path, group.messages, rootKey)}
        </section>;
      })}
    </section>}
  </main>;
}
