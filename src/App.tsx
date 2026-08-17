import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportWarning, UniversalConversation } from "./domain/conversation";
import { ImportDropzone, type ImportSelection } from "./components/ImportDropzone";
import { ConversationList } from "./components/ConversationList";
import { ConversationReader } from "./components/ConversationReader";
import { GroupSwitcher } from "./components/GroupSwitcher";
import { TinykoMark } from "./components/TinykoMark";
import { importEntries } from "./features/import/import-pipeline";
import { mergeImportIntoGroup } from "./features/groups/group-import";
import { clearAllStoredData, deleteGroup, listGroups, loadGroup, revokeConversationUrls, saveGroup } from "./features/groups/group-store";
import type { ConversationGroup, GroupData } from "./features/groups/group-types";
import { createId } from "./lib/ids";
import { searchConversations } from "./features/search/search";
import { readThemePreference, resolvedTheme, THEME_STORAGE_KEY, type ThemePreference } from "./lib/theme";

type DialogKind = "create" | "rename" | "delete" | "clear";

function chronological(conversations: UniversalConversation[]): UniversalConversation[] {
  return [...conversations].sort((a, b) => new Date(b.metadata.updatedAt ?? b.metadata.createdAt ?? 0).getTime() - new Date(a.metadata.updatedAt ?? a.metadata.createdAt ?? 0).getTime());
}

function saveSelectedConversation(id?: string): void {
  if (id) localStorage.setItem("archive-viewer.active-conversation", id);
  else localStorage.removeItem("archive-viewer.active-conversation");
}

function ManagementDialog({ kind, initialName, onCancel, onConfirm }: { kind: DialogKind; initialName?: string; onCancel(): void; onConfirm(name?: string): void }) {
  const needsName = kind === "create" || kind === "rename";
  const [name, setName] = useState(initialName || "");
  const title = kind === "create" ? "新增分组" : kind === "rename" ? "重命名分组" : kind === "delete" ? "删除当前分组？" : "清除所有本地数据？";
  const description = kind === "delete"
    ? "当前分组内的所有对话与附件都会从本设备移除，此操作无法恢复。"
    : kind === "clear"
      ? "所有分组、对话、附件与本地设置都会从本设备移除，此操作无法恢复。"
      : kind === "create" ? "创建后可以在此分组中导入更多对话。" : "为当前分组设置一个容易辨认的名称。";
  return <div className="dialog-backdrop" role="presentation">
    <form className="management-dialog" role="dialog" aria-modal="true" aria-labelledby="management-dialog-title" onSubmit={(event) => { event.preventDefault(); if (!needsName || name.trim()) onConfirm(name.trim()); }}>
      <h2 id="management-dialog-title">{title}</h2>
      <p>{description}</p>
      {needsName && <label>分组名称<input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：工作账号" /></label>}
      <div className="dialog-actions"><button type="button" className="text-button" onClick={onCancel}>取消</button><button type="submit" className={kind === "delete" || kind === "clear" ? "danger-button" : "primary-button"}>{kind === "delete" ? "删除分组" : kind === "clear" ? "清除全部" : "确认"}</button></div>
    </form>
  </div>;
}

function ImportHome({ embedded, importing, onImport, onResume, errors = [], warnings = [], onDismiss }: { embedded?: boolean; importing: boolean; onImport(selection: ImportSelection): void; onResume?(): void; errors?: string[]; warnings?: ImportWarning[]; onDismiss?(kind: "error" | "warning", index: number): void }) {
  return <main className={`welcome${embedded ? " workspace-welcome" : ""}`}>
    <header className="home-header"><h1>archive viewer</h1></header>
    <section className="welcome-copy"><ImportDropzone disabled={importing} onImport={onImport} />{onResume && <button type="button" className="text-button resume-button" onClick={onResume}>继续浏览已有分组</button>}{!embedded && <ImportFeedback errors={errors} warnings={warnings} onDismiss={onDismiss} />}</section>
  </main>;
}

export default function App() {
  const [groups, setGroups] = useState<ConversationGroup[]>([]);
  const [active, setActive] = useState<GroupData>();
  const activeRef = useRef<GroupData | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>();
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [showHome, setShowHome] = useState(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => () => { if (activeRef.current) revokeConversationUrls(activeRef.current.conversations); }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = resolvedTheme(theme, media);
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (theme !== "system") return undefined;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!warnings.some((warning) => warning.code === "IMPORT_MERGED")) return undefined;
    const timeout = window.setTimeout(() => setWarnings((current) => current.filter((warning) => warning.code !== "IMPORT_MERGED")), 6000);
    return () => window.clearTimeout(timeout);
  }, [warnings]);
  useEffect(() => {
    let cancelled = false;
    async function restore(): Promise<void> {
      try {
        const available = await listGroups();
        if (cancelled) return;
        setGroups(available);
        const remembered = localStorage.getItem("archive-viewer.active-group");
        const target = available.find((group) => group.id === remembered) || available[0];
        if (target) {
          const data = await loadGroup(target.id);
          if (cancelled) {
            if (data) revokeConversationUrls(data.conversations);
            return;
          }
          if (data) {
            setActive(data);
            const rememberedConversation = localStorage.getItem("archive-viewer.active-conversation");
            setSelectedId(rememberedConversation && data.conversations.some((conversation) => conversation.id === rememberedConversation) ? rememberedConversation : chronological(data.conversations)[0]?.id);
            localStorage.setItem("archive-viewer.active-group", data.group.id);
            setShowHome(true);
          }
        }
      } catch (error) {
        if (!cancelled) setErrors([error instanceof Error ? error.message : "无法读取本地数据。"]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => chronological(active?.conversations || []), [active]);
  const matches = useMemo(() => searchConversations(sorted, query), [sorted, query]);
  const visible = sorted.filter((conversation) => matches.has(conversation.id));
  const selected = active?.conversations.find((conversation) => conversation.id === selectedId) || visible[0] || sorted[0];

  function replaceActive(data: GroupData, selectedConversationId?: string): void {
    setActive((current) => {
      if (current) revokeConversationUrls(current.conversations);
      return data;
    });
    setGroups((current) => [data.group, ...current.filter((group) => group.id !== data.group.id)]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    localStorage.setItem("archive-viewer.active-group", data.group.id);
    const nextSelected = selectedConversationId || chronological(data.conversations)[0]?.id;
    setSelectedId(nextSelected);
    saveSelectedConversation(nextSelected);
    setQuery("");
  }

  async function selectGroup(groupId: string): Promise<void> {
    if (groupId === active?.group.id) {
      setShowHome(false);
      return;
    }
    try {
      const data = await loadGroup(groupId);
      if (!data) return;
      const remembered = localStorage.getItem("archive-viewer.active-conversation");
      replaceActive(data, remembered && data.conversations.some((conversation) => conversation.id === remembered) ? remembered : undefined);
      setSidebarOpen(false);
      setShowHome(data.conversations.length === 0);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "无法切换分组。"]);
    }
  }

  async function handleImport(selection: ImportSelection): Promise<void> {
    setImporting(true);
    let temporaryConversations: UniversalConversation[] = [];
    try {
      const report = await importEntries(selection.entries, selection.sourceType);
      temporaryConversations = report.archive.conversations;
      setWarnings(report.warnings);
      setErrors(report.errors);
      if (!report.archive.conversations.length) return;
      const result = mergeImportIntoGroup(active, report);
      await saveGroup({ group: result.group, conversations: result.conversations }, result.batch);
      const persisted = await loadGroup(result.group.id);
      if (!persisted) throw new Error("导入后的分组无法读取。");
      // IndexedDB has its own attachment blobs now; dispose URLs created for the import snapshot.
      revokeConversationUrls(temporaryConversations);
      temporaryConversations = [];
      replaceActive(persisted);
      setSidebarOpen(false);
      setShowHome(false);
      const summary = `导入完成：新增 ${result.stats.addedConversations} 个对话、${result.stats.addedMessages} 条消息；跳过 ${result.stats.skippedMessages} 条重复消息${result.stats.revisionMessages ? `；保留 ${result.stats.revisionMessages} 个修订分支` : ""}。`;
      setWarnings((current) => [...current, { code: "IMPORT_MERGED", message: summary }]);
    } catch (error) {
      setErrors((current) => [...current, error instanceof Error ? error.message : "导入失败。"]);
    } finally {
      revokeConversationUrls(temporaryConversations);
      setImporting(false);
    }
  }

  async function createGroup(name?: string): Promise<void> {
    const now = new Date().toISOString();
    const group: ConversationGroup = { id: createId("group"), name: name?.trim() || "新分组", providerIds: [], createdAt: now, updatedAt: now };
    try {
      await saveGroup({ group, conversations: [] });
      replaceActive({ group, conversations: [] });
      setDialog(undefined);
      setSidebarOpen(false);
      setShowHome(true);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "无法创建分组。"]);
    }
  }

  async function renameGroup(name?: string): Promise<void> {
    if (!active || !name?.trim()) return;
    const group = { ...active.group, name: name.trim(), updatedAt: new Date().toISOString() };
    try {
      await saveGroup({ group, conversations: active.conversations });
      const persisted = await loadGroup(group.id);
      if (!persisted) throw new Error("重命名后的分组无法读取。");
      replaceActive(persisted, selected?.id);
      setDialog(undefined);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "无法重命名分组。"]);
    }
  }

  async function removeGroup(): Promise<void> {
    if (!active) return;
    const removing = active;
    try {
      await deleteGroup(removing.group.id);
      revokeConversationUrls(removing.conversations);
      const remaining = groups.filter((group) => group.id !== removing.group.id);
      setActive(undefined);
      setGroups(remaining);
      setSelectedId(undefined);
      saveSelectedConversation(undefined);
      localStorage.removeItem("archive-viewer.active-group");
      setDialog(undefined);
      if (remaining[0]) await selectGroup(remaining[0].id);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "无法删除分组。"]);
    }
  }

  async function clearAll(): Promise<void> {
    try {
      await clearAllStoredData();
      if (active) revokeConversationUrls(active.conversations);
      setActive(undefined);
      setGroups([]);
      setSelectedId(undefined);
      setWarnings([]);
      setErrors([]);
      setQuery("");
      setTheme("system");
      setShowHome(false);
      setDialog(undefined);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "无法清除本地数据。"]);
    }
  }

  function selectConversation(id: string): void {
    setSelectedId(id);
    saveSelectedConversation(id);
    setSidebarOpen(false);
    setShowHome(false);
  }

  function dismissFeedback(kind: "error" | "warning", index: number): void {
    if (kind === "error") setErrors((current) => current.filter((_, currentIndex) => currentIndex !== index));
    else setWarnings((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  const confirmDialog = (name?: string) => {
    if (dialog === "create") void createGroup(name);
    if (dialog === "rename") void renameGroup(name);
    if (dialog === "delete") void removeGroup();
    if (dialog === "clear") void clearAll();
  };

  if (loading) return <main className="loading-screen">正在读取本地对话…</main>;
  return <div className="app-shell">
    {!active ? <ImportHome importing={importing} onImport={(selection) => void handleImport(selection)} onResume={groups.length > 0 ? () => void selectGroup(groups[0]!.id) : undefined} errors={errors} warnings={warnings} onDismiss={dismissFeedback} /> : <div className="workspace">
      <div className={`sidebar-backdrop${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`} aria-label="对话侧边栏">
        <div className="sidebar-content">
          <div className="sidebar-brand"><a className="brand" href="/" aria-label="返回首页" onClick={(event) => { event.preventDefault(); setShowHome(true); setSidebarOpen(false); }}><TinykoMark /></a><button type="button" className="mobile-close" aria-label="关闭列表" onClick={() => setSidebarOpen(false)}>×</button></div>
          <ImportDropzone compact disabled={importing} onImport={(selection) => void handleImport(selection)} />
          <label className="search"><span>搜索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索对话" /></label>
          <p className="count">{visible.length} / {sorted.length} 个对话</p>
          <ConversationList conversations={visible} selectedId={selected?.id} onSelect={selectConversation} />
        </div>
        <GroupSwitcher activeGroup={active!.group} groups={groups} onSelect={(id) => void selectGroup(id)} onCreate={() => setDialog("create")} onRename={() => setDialog("rename")} onDelete={() => setDialog("delete")} onClearAll={() => setDialog("clear")} theme={theme} onThemeChange={setTheme} />
      </aside>
      <div className="reader-wrap">
        <header className="mobile-reader-bar"><button type="button" aria-label="打开对话列表" onClick={() => setSidebarOpen(true)}>☰</button><span>{showHome ? "主页" : selected?.metadata.title || active!.group.name}</span></header>
        {showHome ? <ImportHome embedded importing={importing} onImport={(selection) => void handleImport(selection)} /> : <ConversationReader conversation={selected} onGoHome={() => setShowHome(true)} />}
      </div>
      {(errors.length > 0 || warnings.length > 0) && <div className="feedback-float"><ImportFeedback errors={errors} warnings={warnings} onDismiss={dismissFeedback} /></div>}
    </div>}
    {dialog && <ManagementDialog key={dialog} kind={dialog} initialName={dialog === "rename" ? active?.group.name : ""} onCancel={() => setDialog(undefined)} onConfirm={confirmDialog} />}
  </div>;
}

function ImportFeedback({ errors, warnings, onDismiss }: { errors: string[]; warnings: ImportWarning[]; onDismiss?(kind: "error" | "warning", index: number): void }) {
  if (!errors.length && !warnings.length) return null;
  return <section className="import-feedback" aria-live="polite">
    {errors.map((error, index) => <p className="error" key={`${error}-${index}`}><span>{error}</span>{onDismiss && <button className="feedback-dismiss" type="button" aria-label="关闭提示" onClick={() => onDismiss("error", index)}>×</button>}</p>)}
    {warnings.map((warning, index) => <p className="warning" key={`${warning.code}-${index}`}><span>{warning.message}</span>{onDismiss && <button className="feedback-dismiss" type="button" aria-label="关闭提示" onClick={() => onDismiss("warning", index)}>×</button>}</p>)}
  </section>;
}
