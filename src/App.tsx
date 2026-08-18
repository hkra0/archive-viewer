import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportWarning, UniversalConversation } from "./domain/conversation";
import { droppedEntries, ImportDropzone, type ImportSelection } from "./components/ImportDropzone";
import { ConversationList } from "./components/ConversationList";
import { ConversationReader } from "./components/ConversationReader";
import { GroupSwitcher } from "./components/GroupSwitcher";
import { Icon } from "./components/Icons";
import { TinykoMark } from "./components/TinykoMark";
import { importEntries, type ImportReport } from "./features/import/import-pipeline";
import { mergeImportIntoGroup } from "./features/groups/group-import";
import { resolveImportDestination } from "./features/groups/group-resolution";
import { clearAllStoredData, deleteGroup, listGroups, loadGroup, revokeConversationUrls, saveGroup } from "./features/groups/group-store";
import type { ConversationGroup, GroupData } from "./features/groups/group-types";
import { createId } from "./lib/ids";
import { useI18n } from "./lib/i18n";
import { useAppRouter } from "./lib/router";
import { searchConversations } from "./features/search/search";
import { readThemePreference, resolvedTheme, THEME_STORAGE_KEY, type ThemePreference } from "./lib/theme";

type DialogKind = "create" | "rename";
type GroupFormValues = { name: string; note?: string };
type PendingImport = { report: ImportReport; recommendedGroupId?: string };
const SIDEBAR_COLLAPSED_KEY = "archive-viewer.sidebar-collapsed";

function chronological(conversations: UniversalConversation[]): UniversalConversation[] {
  return [...conversations].sort((a, b) => new Date(b.metadata.updatedAt ?? b.metadata.createdAt ?? 0).getTime() - new Date(a.metadata.updatedAt ?? a.metadata.createdAt ?? 0).getTime());
}

function saveSelectedConversation(id?: string): void {
  if (id) localStorage.setItem("archive-viewer.active-conversation", id);
  else localStorage.removeItem("archive-viewer.active-conversation");
}

function ManagementDialog({ kind, initialName, initialNote, onCancel, onConfirm }: { kind: DialogKind; initialName?: string; initialNote?: string; onCancel(): void; onConfirm(values: GroupFormValues): void }) {
  const { t } = useI18n();
  const needsName = kind === "create" || kind === "rename";
  const [name, setName] = useState(initialName || "");
  const [note, setNote] = useState(initialNote || "");
  const [nameError, setNameError] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const title = kind === "create" ? t("createGroup") : t("renameGroupTitle");
  const description = kind === "create" ? t("createGroupDescription") : t("renameGroupDescription");
  return <div className="dialog-backdrop" role="presentation"><form className="management-dialog" role="dialog" aria-modal="true" aria-labelledby="management-dialog-title" onSubmit={(event) => { event.preventDefault(); if (needsName && !name.trim()) { setNameError(true); nameInput.current?.focus(); return; } onConfirm({ name: name.trim(), note: note.trim() || undefined }); }}>
    <h2 id="management-dialog-title">{title}</h2><p>{description}</p>
    {needsName && <label>{t("groupName")}<input ref={nameInput} autoFocus value={name} maxLength={80} aria-invalid={nameError} aria-describedby={nameError ? "group-name-error" : undefined} onChange={(event) => { setName(event.target.value); if (event.target.value.trim()) setNameError(false); }} placeholder={t("groupNamePlaceholder")} />{nameError && <span id="group-name-error" className="field-error" role="alert">{t("groupNameRequired")}</span>}</label>}
    <label className="group-note-field">{t("groupRemark")}<input value={note} maxLength={160} onChange={(event) => setNote(event.target.value)} placeholder={t("groupRemarkPlaceholder")} /></label>
    <div className="dialog-actions"><button type="button" className="text-button" onClick={onCancel}>{t("cancel")}</button><button type="submit" className="primary-button">{t("confirm")}</button></div>
  </form></div>;
}

function ImportDestinationDialog({ pending, groups, onCancel, onConfirm }: { pending: PendingImport; groups: ConversationGroup[]; onCancel(): void; onConfirm(groupId?: string): void }) {
  const { t } = useI18n();
  const [target, setTarget] = useState(pending.recommendedGroupId || "new");
  return <div className="dialog-backdrop" role="presentation"><form className="management-dialog import-destination-dialog" role="dialog" aria-modal="true" aria-labelledby="import-destination-title" onSubmit={(event) => { event.preventDefault(); onConfirm(target === "new" ? undefined : target); }}>
    <h2 id="import-destination-title">{t("importDestination")}</h2><p>{t("importDestinationHint")}</p>
    {pending.report.account && <p className="import-profile">{[pending.report.account.displayName, pending.report.account.email].filter(Boolean).join(" · ")}</p>}
    <label className="destination-option"><input type="radio" name="destination" value="new" checked={target === "new"} onChange={() => setTarget("new")} />{t("createNewGroup")}</label>
    <label className="destination-option"><input type="radio" name="destination" value="existing" checked={target !== "new"} onChange={() => setTarget(pending.recommendedGroupId || groups[0]?.id || "new")} />{t("mergeInto")}</label>
    {target !== "new" && <select value={target} onChange={(event) => setTarget(event.target.value)} aria-label={t("groups")}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.id === pending.recommendedGroupId ? ` · ${t("recommended")}` : ""}</option>)}</select>}
    <div className="dialog-actions"><button type="button" className="text-button" onClick={onCancel}>{t("cancel")}</button><button type="submit" className="primary-button">{t("importNow")}</button></div>
  </form></div>;
}

function ImportHome({ embedded, importing, onImport, onResume, errors = [], warnings = [], onDismiss }: { embedded?: boolean; importing: boolean; onImport(selection: ImportSelection): void; onResume?(): void; errors?: string[]; warnings?: ImportWarning[]; onDismiss?(kind: "error" | "warning", index: number): void }) {
  const { t } = useI18n();
  return <main className={`welcome${embedded ? " workspace-welcome" : ""}`}><header className="home-header"><h1>archive viewer</h1></header><section className="welcome-copy"><ImportDropzone disabled={importing} onImport={onImport} />{onResume && <button type="button" className="text-button resume-button" onClick={onResume}>{t("resume")}</button>}{!embedded && <ImportFeedback errors={errors} warnings={warnings} onDismiss={onDismiss} />}</section></main>;
}

export default function App() {
  const { t } = useI18n();
  const { route, navigate } = useAppRouter();
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
  const [dialog, setDialog] = useState<DialogKind>();
  const [editingGroupId, setEditingGroupId] = useState<string>();
  const [pendingImport, setPendingImport] = useState<PendingImport>();
  const [toast, setToast] = useState<string>();
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [showHome, setShowHome] = useState(route.kind === "home");
  const [globalDragging, setGlobalDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => () => { if (activeRef.current) revokeConversationUrls(activeRef.current.conversations); }, []);
  useEffect(() => { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed)); }, [sidebarCollapsed]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { const resolved = resolvedTheme(theme, media); document.documentElement.dataset.theme = resolved; document.documentElement.style.colorScheme = resolved; };
    apply(); localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (theme !== "system") return undefined;
    media.addEventListener("change", apply); return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!warnings.some((warning) => warning.code === "IMPORT_MERGED")) return undefined;
    const timeout = window.setTimeout(() => setWarnings((current) => current.filter((warning) => warning.code !== "IMPORT_MERGED")), 6000);
    return () => window.clearTimeout(timeout);
  }, [warnings]);
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(undefined), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    let cancelled = false;
    async function restore(): Promise<void> {
      try {
        const available = await listGroups(); if (cancelled) return; setGroups(available);
        const requestedGroupId = route.kind === "home" ? localStorage.getItem("archive-viewer.active-group") : route.groupId;
        const target = available.find((group) => group.id === requestedGroupId) || (route.kind === "home" ? available[0] : undefined);
        if (route.kind !== "home" && !target) { setErrors([t("invalidLink")]); navigate({ kind: "home" }, true); return; }
        if (!target) return;
        const data = await loadGroup(target.id); if (cancelled) { if (data) revokeConversationUrls(data.conversations); return; }
        if (!data) return;
        const requestedConversation = route.kind === "conversation" ? route.conversationId : localStorage.getItem("archive-viewer.active-conversation");
        const next = requestedConversation && data.conversations.some((conversation) => conversation.id === requestedConversation) ? requestedConversation : chronological(data.conversations)[0]?.id;
        setActive(data); setSelectedId(next); saveSelectedConversation(next); localStorage.setItem("archive-viewer.active-group", data.group.id); setShowHome(route.kind === "home" || !next);
        if (route.kind === "conversation" && requestedConversation !== next) { setErrors([t("invalidLink")]); navigate({ kind: "group", groupId: data.group.id }, true); }
      } catch (error) { if (!cancelled) setErrors([error instanceof Error ? error.message : "Unable to read local data."]); }
      finally { if (!cancelled) setLoading(false); }
    }
    void restore(); return () => { cancelled = true; };
  // Initial route is intentionally read once; later navigation is handled below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => chronological(active?.conversations || []), [active]);
  const matches = useMemo(() => searchConversations(sorted, query), [sorted, query]);
  const visible = sorted.filter((conversation) => matches.has(conversation.id));
  const selected = active?.conversations.find((conversation) => conversation.id === selectedId) || visible[0] || sorted[0];

  function replaceActive(data: GroupData, selectedConversationId?: string): string | undefined {
    setActive((current) => { if (current && current.group.id !== data.group.id) revokeConversationUrls(current.conversations); return data; });
    setGroups((current) => [data.group, ...current.filter((group) => group.id !== data.group.id)].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    localStorage.setItem("archive-viewer.active-group", data.group.id);
    const nextSelected = selectedConversationId || chronological(data.conversations)[0]?.id;
    setSelectedId(nextSelected); saveSelectedConversation(nextSelected); setQuery("");
    return nextSelected;
  }

  async function activateGroup(groupId: string, requestedConversationId?: string): Promise<boolean> {
    try {
      const data = groupId === active?.group.id ? active : await loadGroup(groupId);
      if (!data) return false;
      const next = requestedConversationId && data.conversations.some((conversation) => conversation.id === requestedConversationId) ? requestedConversationId : chronological(data.conversations)[0]?.id;
      replaceActive(data, next); setSidebarOpen(false); setShowHome(!next); return true;
    } catch (error) { setErrors([error instanceof Error ? error.message : "Unable to switch group."]); return false; }
  }

  useEffect(() => {
    if (loading) return;
    if (route.kind === "home") { setShowHome(true); return; }
    void (async () => { const exists = await activateGroup(route.groupId, route.kind === "conversation" ? route.conversationId : undefined); if (!exists) { setErrors([t("invalidLink")]); navigate({ kind: "home" }, true); } })();
  // Route changes are the input; active is resolved by activateGroup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, loading]);

  async function selectGroup(groupId: string): Promise<void> { const exists = await activateGroup(groupId); if (exists) navigate({ kind: "group", groupId }); }
  function showImportHome(): void { navigate({ kind: "home" }); setShowHome(true); setSidebarOpen(false); }

  async function commitImport(report: ImportReport, targetGroupId?: string): Promise<void> {
    setImporting(true); let temporaryConversations = report.archive.conversations;
    try {
      const target = targetGroupId ? targetGroupId === active?.group.id ? active : await loadGroup(targetGroupId) : undefined;
      const result = mergeImportIntoGroup(target, report);
      await saveGroup({ group: result.group, conversations: result.conversations }, result.batch);
      const persisted = await loadGroup(result.group.id); if (!persisted) throw new Error("Imported group could not be read.");
      revokeConversationUrls(temporaryConversations); temporaryConversations = [];
      const next = replaceActive(persisted); setSidebarOpen(false); setShowHome(false);
      navigate(next ? { kind: "conversation", groupId: persisted.group.id, conversationId: next } : { kind: "group", groupId: persisted.group.id });
      const revisions = result.stats.revisionMessages ? t("revisions", { count: result.stats.revisionMessages }) : "";
      setWarnings((current) => [...current, { code: "IMPORT_MERGED", message: t("importSummary", { conversations: result.stats.addedConversations, messages: result.stats.addedMessages, skipped: result.stats.skippedMessages, revisions }) }]);
    } catch (error) { setErrors((current) => [...current, error instanceof Error ? error.message : "Import failed."]); }
    finally { revokeConversationUrls(temporaryConversations); setImporting(false); }
  }

  async function handleImport(selection: ImportSelection): Promise<void> {
    setImporting(true);
    try {
      const report = await importEntries(selection.entries, selection.sourceType);
      const formattedWarnings = report.warnings.map((warning) => warning.code === "EMPTY_CONVERSATION_SKIPPED" ? { ...warning, message: t("importSkippedEmpty", { count: warning.message }) } : warning);
      setWarnings(formattedWarnings); setErrors(report.errors);
      if (!report.archive.conversations.length) return;
      const destination = resolveImportDestination(report, groups, active);
      if (destination.requiresConfirmation) { setPendingImport({ report, recommendedGroupId: destination.recommendedGroupId }); return; }
      await commitImport(report, destination.recommendedGroupId);
    } catch (error) { setErrors((current) => [...current, error instanceof Error ? error.message : "Import failed."]); }
    finally { setImporting(false); }
  }

  useEffect(() => {
    const hasFiles = (transfer?: DataTransfer | null) => Array.from(transfer?.types || []).includes("Files");
    const enter = (event: DragEvent) => { if (!importing && hasFiles(event.dataTransfer)) { event.preventDefault(); dragDepth.current += 1; setGlobalDragging(true); } };
    const over = (event: DragEvent) => { if (!importing && hasFiles(event.dataTransfer)) event.preventDefault(); };
    const leave = (event: DragEvent) => { if (hasFiles(event.dataTransfer)) { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setGlobalDragging(false); } };
    const drop = (event: DragEvent) => { const transfer = event.dataTransfer; if (!hasFiles(transfer) || !transfer) return; event.preventDefault(); dragDepth.current = 0; setGlobalDragging(false); if (!importing) void droppedEntries(transfer).then((selection) => { if (selection.entries.length) void handleImport(selection); }).catch(() => undefined); };
    document.addEventListener("dragenter", enter); document.addEventListener("dragover", over); document.addEventListener("dragleave", leave); document.addEventListener("drop", drop);
    return () => { document.removeEventListener("dragenter", enter); document.removeEventListener("dragover", over); document.removeEventListener("dragleave", leave); document.removeEventListener("drop", drop); };
  }, [importing, groups, active]);

  async function createGroup(values?: GroupFormValues): Promise<void> {
    const now = new Date().toISOString(); const group: ConversationGroup = { id: createId("group"), name: values?.name.trim() || t("newGroup"), note: values?.note, providerIds: [], createdAt: now, updatedAt: now };
    try { await saveGroup({ group, conversations: [] }); replaceActive({ group, conversations: [] }); setDialog(undefined); setSidebarOpen(false); setShowHome(true); navigate({ kind: "group", groupId: group.id }); }
    catch (error) { setErrors([error instanceof Error ? error.message : "Unable to create group."]); }
  }
  async function renameGroup(values: GroupFormValues): Promise<void> {
    const groupId = editingGroupId || active?.group.id;
    if (!groupId || !values.name.trim()) return;
    try {
      const data = groupId === active?.group.id ? active : await loadGroup(groupId);
      if (!data) throw new Error("Group could not be read.");
      const group = { ...data.group, name: values.name.trim(), note: values.note, updatedAt: new Date().toISOString() };
      await saveGroup({ group, conversations: data.conversations });
      const persisted = await loadGroup(group.id); if (!persisted) throw new Error("Renamed group could not be read.");
      if (group.id === active?.group.id) replaceActive(persisted, selected?.id);
      else setGroups((current) => current.map((item) => item.id === group.id ? persisted.group : item));
      setEditingGroupId(undefined); setDialog(undefined);
    }
    catch (error) { setErrors([error instanceof Error ? error.message : "Unable to rename group."]); }
  }
  async function removeGroup(groupId = active?.group.id): Promise<void> {
    if (!groupId) return;
    try {
      const removing = groupId === active?.group.id ? active : await loadGroup(groupId);
      if (!removing) return;
      setToast(undefined); await deleteGroup(removing.group.id); revokeConversationUrls(removing.conversations);
      const remaining = groups.filter((group) => group.id !== removing.group.id); setGroups(remaining);
      if (removing.group.id !== active?.group.id) return;
      setActive(undefined); setSelectedId(undefined); saveSelectedConversation(undefined); localStorage.removeItem("archive-viewer.active-group"); setDialog(undefined); if (remaining[0]) await selectGroup(remaining[0].id); else { setShowHome(false); navigate({ kind: "home" }); }
    }
    catch (error) { setErrors([error instanceof Error ? error.message : "Unable to delete group."]); }
  }
  async function clearAll(): Promise<void> {
    try { setToast(undefined); await clearAllStoredData(); if (active) revokeConversationUrls(active.conversations); setActive(undefined); setGroups([]); setSelectedId(undefined); setWarnings([]); setErrors([]); setQuery(""); setTheme("system"); setShowHome(false); setDialog(undefined); navigate({ kind: "home" }); }
    catch (error) { setErrors([error instanceof Error ? error.message : "Unable to clear local data."]); }
  }
  function showToast(message: string): void { setToast(message); }
  function selectConversation(id: string): void { setSelectedId(id); saveSelectedConversation(id); setSidebarOpen(false); setShowHome(false); if (active) navigate({ kind: "conversation", groupId: active.group.id, conversationId: id }); }
  function dismissFeedback(kind: "error" | "warning", index: number): void { if (kind === "error") setErrors((current) => current.filter((_, currentIndex) => currentIndex !== index)); else setWarnings((current) => current.filter((_, currentIndex) => currentIndex !== index)); }
  function confirmDialog(values: GroupFormValues): void { if (dialog === "create") void createGroup(values); if (dialog === "rename") void renameGroup(values); }

  if (loading) return <main className="loading-screen">{t("loading")}</main>;
  return <div className="app-shell">
    {globalDragging && <div className="global-drop-overlay" aria-hidden="true"><div><Icon name="import" />{t("globalDrop")}</div></div>}
    {!active ? <ImportHome importing={importing} onImport={(selection) => void handleImport(selection)} onResume={groups.length > 0 ? () => void selectGroup(groups[0]!.id) : undefined} errors={errors} warnings={warnings} onDismiss={dismissFeedback} /> : <div className={`workspace${sidebarCollapsed ? " sidebar-is-collapsed" : ""}${showHome ? " is-home" : ""}`}>
      <div className={`sidebar-backdrop${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar${sidebarOpen ? " open" : ""}${sidebarCollapsed ? " collapsed" : ""}`} aria-label={t("openList")}>
        <div className="sidebar-content">
          <div className="sidebar-brand"><a className="brand" href="/" aria-label={t("home")} onClick={(event) => { event.preventDefault(); showImportHome(); }}><TinykoMark /></a><button type="button" className="sidebar-collapse" aria-label={sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")} onClick={() => setSidebarCollapsed((value) => !value)}><Icon name="panel" /></button><button type="button" className="mobile-close" aria-label={t("closeList")} onClick={() => setSidebarOpen(false)}>×</button></div>
          <div className="collapsed-sidebar-actions"><button type="button" aria-label={t("openSearch")} onClick={() => { setSidebarCollapsed(false); window.setTimeout(() => document.querySelector<HTMLInputElement>(".search input")?.focus(), 0); }}><Icon name="search" /></button><button type="button" className="collapsed-import-button" aria-label={t("import")} onClick={showImportHome}><Icon name="import" /></button></div>
          <ImportDropzone compact disabled={importing} onImport={(selection) => void handleImport(selection)} onOpenImportHome={showImportHome} />
          <label className="search"><span>{t("search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} /></label>
          <p className="count">{t("conversationCount", { visible: visible.length, total: sorted.length })}</p><ConversationList conversations={visible} selectedId={selected?.id} onSelect={selectConversation} />
        </div>
        <GroupSwitcher activeGroup={active.group} groups={groups} onSelect={(id) => void selectGroup(id)} onCreate={() => setDialog("create")} onRename={(id) => { setEditingGroupId(id); setDialog("rename"); }} onDelete={(id) => void removeGroup(id)} onClearAll={() => void clearAll()} onToast={showToast} theme={theme} onThemeChange={setTheme} />
      </aside>
      <div className="reader-wrap"><header className="mobile-reader-bar"><button type="button" aria-label={t("openList")} onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button><span>{showHome ? t("home") : selected?.metadata.title || active.group.name}</span></header>{showHome ? <ImportHome embedded importing={importing} onImport={(selection) => void handleImport(selection)} /> : <ConversationReader conversation={selected} onGoHome={showImportHome} />}</div>
      {(errors.length > 0 || warnings.length > 0) && <div className="feedback-float"><ImportFeedback errors={errors} warnings={warnings} onDismiss={dismissFeedback} /></div>}
    </div>}
    {dialog && <ManagementDialog key={`${dialog}-${editingGroupId || "new"}`} kind={dialog} initialName={dialog === "rename" ? groups.find((group) => group.id === editingGroupId)?.name || "" : ""} initialNote={dialog === "rename" ? groups.find((group) => group.id === editingGroupId)?.note || groups.find((group) => group.id === editingGroupId)?.account?.email || "" : ""} onCancel={() => { setEditingGroupId(undefined); setDialog(undefined); }} onConfirm={confirmDialog} />}
    {pendingImport && <ImportDestinationDialog pending={pendingImport} groups={groups} onCancel={() => setPendingImport(undefined)} onConfirm={(groupId) => { const report = pendingImport.report; setPendingImport(undefined); void commitImport(report, groupId); }} />}
    {toast && <div className="action-toast" role="status">{toast}</div>}
  </div>;
}

function ImportFeedback({ errors, warnings, onDismiss }: { errors: string[]; warnings: ImportWarning[]; onDismiss?(kind: "error" | "warning", index: number): void }) {
  if (!errors.length && !warnings.length) return null;
  return <section className="import-feedback" aria-live="polite">{errors.map((error, index) => <p className="error" key={`${error}-${index}`}><span>{error}</span>{onDismiss && <button className="feedback-dismiss" type="button" aria-label="Close" onClick={() => onDismiss("error", index)}>×</button>}</p>)}{warnings.map((warning, index) => <p className="warning" key={`${warning.code}-${index}`}><span>{warning.message}</span>{onDismiss && <button className="feedback-dismiss" type="button" aria-label="Close" onClick={() => onDismiss("warning", index)}>×</button>}</p>)}</section>;
}
