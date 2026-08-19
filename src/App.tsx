import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportWarning, UniversalConversation } from "./domain/conversation";
import { droppedEntries, ImportDropzone, type ImportSelection } from "./components/ImportDropzone";
import { ConversationList } from "./components/ConversationList";
import { ConversationReader } from "./components/ConversationReader";
import { archiveSectionLabel, ArchiveSectionNavigation, ArchiveSectionReader } from "./components/ArchiveSections";
import { ArchiveHealth } from "./components/ArchiveHealth";
import { GroupSwitcher } from "./components/GroupSwitcher";
import { Icon } from "./components/Icons";
import { TinykoMark } from "./components/TinykoMark";
import { importEntries, type ImportReport } from "./features/import/import-pipeline";
import { mergeImportIntoGroup, suggestedGroupName } from "./features/groups/group-import";
import { clearAllStoredData, deleteGroup, listGroups, loadGroup, revokeConversationUrls, saveGroup } from "./features/groups/group-store";
import type { ConversationGroup, ExportPreferences, GroupData } from "./features/groups/group-types";
import { createId } from "./lib/ids";
import { useI18n } from "./lib/i18n";
import { useAppRouter, type AppRoute } from "./lib/router";
import { searchConversations } from "./features/search/search";
import { readThemePreference, resolvedTheme, THEME_STORAGE_KEY, type ThemePreference } from "./lib/theme";
import { selectedConversationIds, withConversationSelected } from "./features/selection/conversation-selection";

type DialogKind = "create" | "rename";
type GroupFormValues = { name: string; note?: string };
type PendingImport = { report: ImportReport; defaultGroupName: string };
type Toast = { message: string; durationMs?: number };
const SIDEBAR_COLLAPSED_KEY = "archive-viewer.sidebar-collapsed";
const FEEDBACK_DURATION_MS = 6000;
const FEEDBACK_FADE_DURATION_MS = 2000;

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

function ImportDestinationDialog({ pending, groups, onCancel, onConfirm }: { pending: PendingImport; groups: ConversationGroup[]; onCancel(): void; onConfirm(groupId?: string, newGroupName?: string): void }) {
  const { t } = useI18n();
  const [target, setTarget] = useState("new");
  const [newGroupName, setNewGroupName] = useState(pending.defaultGroupName);
  return <div className="dialog-backdrop" role="presentation"><form className="management-dialog import-destination-dialog" role="dialog" aria-modal="true" aria-labelledby="import-destination-title" onSubmit={(event) => { event.preventDefault(); if (target === "new" && !newGroupName.trim()) return; onConfirm(target === "new" ? undefined : target, target === "new" ? newGroupName.trim() : undefined); }}>
    <h2 id="import-destination-title">{t("importDestination")}</h2><p>{t("importDestinationHint")}</p>
    {pending.report.account && <p className="import-profile">{[pending.report.account.displayName, pending.report.account.email].filter(Boolean).join(" · ")}</p>}
    <div className="destination-tabs" role="tablist" aria-label={t("importDestination")}>
      <button type="button" role="tab" id="destination-new-tab" aria-selected={target === "new"} aria-controls="destination-new-panel" className={target === "new" ? "active" : ""} onClick={() => setTarget("new")}>{t("createNewGroup")}</button>
      <button type="button" role="tab" id="destination-existing-tab" aria-selected={target !== "new"} aria-controls="destination-existing-panel" className={target !== "new" ? "active" : ""} onClick={() => setTarget(groups[0]?.id || "new")}>{t("mergeInto")}</button>
    </div>
    {target === "new" ? <div className="destination-panel" id="destination-new-panel" role="tabpanel" aria-labelledby="destination-new-tab"><label>{t("groupName")}<input autoFocus value={newGroupName} maxLength={80} required onChange={(event) => setNewGroupName(event.target.value)} /></label></div> : <div className="destination-panel" id="destination-existing-panel" role="tabpanel" aria-labelledby="destination-existing-tab"><label>{t("groups")}<select value={target} onChange={(event) => setTarget(event.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>}
    <div className="dialog-actions"><button type="button" className="text-button" onClick={onCancel}>{t("cancel")}</button><button type="submit" className="primary-button">{t("importNow")}</button></div>
  </form></div>;
}

function ImportHome({ embedded, importing, onImport, onResume, errors = [], warnings = [], onDismiss }: { embedded?: boolean; importing: boolean; onImport(selection: ImportSelection): void; onResume?(): void; errors?: string[]; warnings?: ImportWarning[]; onDismiss?(kind: "error" | "warning", index: number): void }) {
  const { t } = useI18n();
  return <main className={`welcome${embedded ? " workspace-welcome" : ""}`}><header className="home-header"><h1>archive viewer</h1></header><section className="welcome-copy"><ImportDropzone disabled={importing} onImport={onImport} />{onResume && <button type="button" className="text-button resume-button" onClick={onResume}>{t("resume")}</button>}{!embedded && <FeedbackQueue floating errors={errors} warnings={warnings} onDismiss={onDismiss} />}</section></main>;
}

function TransientNotice({ children, onDismiss, active = true, durationMs = FEEDBACK_DURATION_MS }: { children: React.ReactNode; onDismiss(): void; active?: boolean; durationMs?: number }) {
  const [fading, setFading] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const fadeTimer = useRef<number | undefined>(undefined);
  const dismissTimer = useRef<number | undefined>(undefined);
  const durationRef = useRef(durationMs);
  const resumeFadeOnLeave = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  function clearTimers(): void { window.clearTimeout(fadeTimer.current); window.clearTimeout(dismissTimer.current); }
  function startFading(): void {
    clearTimers(); setFading(true);
    dismissTimer.current = window.setTimeout(() => onDismissRef.current(), FEEDBACK_FADE_DURATION_MS);
  }
  function scheduleFade(delayMs = durationMs): void {
    clearTimers(); fadeTimer.current = window.setTimeout(startFading, delayMs);
  }

  useEffect(() => { clearTimers(); resumeFadeOnLeave.current = false; setInterrupted(false); setFading(false); if (active) scheduleFade(durationRef.current); return clearTimers; }, [active]);

  return <div
    className={`transient-notice${active ? " is-active" : ""}${fading ? " is-fading" : ""}${interrupted ? " is-interrupted" : ""}`}
    onMouseEnter={() => { if (!active) return; resumeFadeOnLeave.current = fading; clearTimers(); setInterrupted(fading); setFading(false); }}
    onMouseLeave={() => { if (!active) return; if (resumeFadeOnLeave.current) { resumeFadeOnLeave.current = false; setInterrupted(false); startFading(); } else scheduleFade(durationRef.current); }}
  >{children}</div>;
}

export default function App() {
  const { locale, t } = useI18n();
  const { route, navigate } = useAppRouter();
  const [groups, setGroups] = useState<ConversationGroup[]>([]);
  const [active, setActive] = useState<GroupData>();
  const activeRef = useRef<GroupData | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedSectionId, setSelectedSectionId] = useState<string>();
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
  const [toast, setToast] = useState<Toast>();
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [showHome, setShowHome] = useState(route.kind === "home");
  const [showStatistics, setShowStatistics] = useState(false);
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
        const requestedConversation = route.kind === "conversation" ? route.conversationId : route.kind === "section" || route.kind === "profile" || route.kind === "memories" || route.kind === "statistics" ? undefined : localStorage.getItem("archive-viewer.active-conversation");
        const next = requestedConversation && data.conversations.some((conversation) => conversation.id === requestedConversation) ? requestedConversation : chronological(data.conversations)[0]?.id;
        const requestedSection = route.kind === "section" ? route.sectionId : route.kind === "profile" || route.kind === "memories" ? data.sections.find((section) => section.kind === route.kind)?.id : undefined;
        const nextSection = requestedSection && data.sections.some((section) => section.id === requestedSection) ? requestedSection : next ? undefined : data.sections[0]?.id;
        setActive(data); setSelectedId(next); setSelectedSectionId(nextSection); saveSelectedConversation(next); localStorage.setItem("archive-viewer.active-group", data.group.id); setShowHome(route.kind === "home" || (!next && !data.sections.length)); setShowStatistics(route.kind === "statistics");
        if (route.kind === "conversation" && requestedConversation !== next) { setErrors([t("invalidLink")]); navigate({ kind: "group", groupId: data.group.id }, true); }
        if ((route.kind === "section" || route.kind === "profile" || route.kind === "memories") && !requestedSection) { setErrors([t("invalidLink")]); navigate({ kind: "group", groupId: data.group.id }, true); }
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
  const markedIds = useMemo(() => selectedConversationIds(active?.conversations || []), [active?.conversations]);
  const selected = active?.conversations.find((conversation) => conversation.id === selectedId) || visible[0] || sorted[0];
  const selectedSection = active?.sections.find((section) => section.id === selectedSectionId);

  function replaceActive(data: GroupData, selectedConversationId?: string): string | undefined {
    setActive((current) => { if (current && current.group.id !== data.group.id) revokeConversationUrls(current.conversations); return data; });
    setGroups((current) => [data.group, ...current.filter((group) => group.id !== data.group.id)].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    localStorage.setItem("archive-viewer.active-group", data.group.id);
    const nextSelected = selectedConversationId || chronological(data.conversations)[0]?.id;
    setSelectedId(nextSelected); setSelectedSectionId(nextSelected ? undefined : data.sections[0]?.id); setShowStatistics(false); saveSelectedConversation(nextSelected); setQuery("");
    return nextSelected;
  }

  async function activateGroup(nextRoute: Exclude<AppRoute, { kind: "home" }>): Promise<boolean> {
    try {
      const data = nextRoute.groupId === active?.group.id ? active : await loadGroup(nextRoute.groupId);
      if (!data) return false;
      const requestedConversationId = nextRoute.kind === "conversation" ? nextRoute.conversationId : undefined;
      const requestedSectionId = nextRoute.kind === "section" ? nextRoute.sectionId : nextRoute.kind === "profile" || nextRoute.kind === "memories" ? data.sections.find((section) => section.kind === nextRoute.kind)?.id : undefined;
      if ((nextRoute.kind === "section" || nextRoute.kind === "profile" || nextRoute.kind === "memories") && !requestedSectionId) return false;
      const next = requestedConversationId && data.conversations.some((conversation) => conversation.id === requestedConversationId) ? requestedConversationId : chronological(data.conversations)[0]?.id;
      replaceActive(data, next); if (requestedSectionId) setSelectedSectionId(requestedSectionId); setShowStatistics(nextRoute.kind === "statistics"); setSidebarOpen(false); setShowHome(false); return true;
    } catch (error) { setErrors([error instanceof Error ? error.message : "Unable to switch group."]); return false; }
  }

  useEffect(() => {
    if (loading) return;
    if (route.kind === "home") { setShowHome(true); return; }
    void (async () => { const exists = await activateGroup(route); if (!exists) { setErrors([t("invalidLink")]); navigate({ kind: "home" }, true); } })();
  // Route changes are the input; active is resolved by activateGroup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, loading]);

  async function selectGroup(groupId: string): Promise<void> { const nextRoute: AppRoute = { kind: "group", groupId }; const exists = await activateGroup(nextRoute); if (exists) navigate(nextRoute); }
  function showImportHome(): void { navigate({ kind: "home" }); setShowHome(true); setShowStatistics(false); setSidebarOpen(false); }

  async function commitImport(report: ImportReport, targetGroupId?: string, newGroupName?: string): Promise<void> {
    setImporting(true); let temporaryConversations = report.archive.conversations;
    try {
      const target = targetGroupId ? targetGroupId === active?.group.id ? active : await loadGroup(targetGroupId) : undefined;
      const result = mergeImportIntoGroup(target, report, newGroupName, locale);
      await saveGroup({ group: result.group, conversations: result.conversations, sections: result.sections }, result.batch);
      const persisted = await loadGroup(result.group.id); if (!persisted) throw new Error("Imported group could not be read.");
      revokeConversationUrls(temporaryConversations); temporaryConversations = [];
      const next = replaceActive(persisted); setSidebarOpen(false); setShowHome(false);
      navigate(next ? { kind: "conversation", groupId: persisted.group.id, conversationId: next } : { kind: "group", groupId: persisted.group.id });
      const revisions = result.stats.revisionMessages ? t("revisions", { count: result.stats.revisionMessages }) : "";
      const summaryKey = result.stats.skippedMessages > 0 ? "importSummaryWithSkipped" : "importSummary";
      setWarnings((current) => [...current, { code: "IMPORT_MERGED", message: t(summaryKey, { conversations: result.stats.addedConversations, messages: result.stats.addedMessages, skipped: result.stats.skippedMessages, revisions }) }]);
    } catch (error) { setErrors((current) => [...current, error instanceof Error ? error.message : "Import failed."]); }
    finally { revokeConversationUrls(temporaryConversations); setImporting(false); }
  }

  async function handleImport(selection: ImportSelection): Promise<void> {
    setImporting(true);
    try {
      const report = await importEntries(selection.entries, selection.sourceType);
      const formattedWarnings = report.warnings.map((warning) => {
        if (warning.code === "EMPTY_CONVERSATIONS_PRESERVED") return { ...warning, message: locale === "zh-CN" ? `为保证完整性，已保留 ${warning.message} 个空对话。` : `Preserved ${warning.message} empty conversations for completeness.` };
        if (warning.code === "EMPTY_MESSAGES_PRESERVED" && warning.count !== undefined) return { ...warning, message: t("emptyMessagesPreserved", { count: warning.count, conversations: warning.conversationCount || 1 }) };
        return warning;
      });
      setWarnings(formattedWarnings); setErrors(report.errors);
      if (!report.archive.conversations.length && !report.archive.sections?.length) return;
      const needsDestinationChoice = groups.length > 0;
      if (needsDestinationChoice) { setPendingImport({ report, defaultGroupName: suggestedGroupName(report, locale) }); return; }
      await commitImport(report);
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
    try { await saveGroup({ group, conversations: [], sections: [] }); replaceActive({ group, conversations: [], sections: [] }); setDialog(undefined); setSidebarOpen(false); setShowHome(true); navigate({ kind: "group", groupId: group.id }); }
    catch (error) { setErrors([error instanceof Error ? error.message : "Unable to create group."]); }
  }
  async function renameGroup(values: GroupFormValues): Promise<void> {
    const groupId = editingGroupId || active?.group.id;
    if (!groupId || !values.name.trim()) return;
    try {
      const data = groupId === active?.group.id ? active : await loadGroup(groupId);
      if (!data) throw new Error("Group could not be read.");
      const group = { ...data.group, name: values.name.trim(), note: values.note, updatedAt: new Date().toISOString() };
      await saveGroup({ group, conversations: data.conversations, sections: data.sections });
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
      setActive(undefined); setSelectedId(undefined); setSelectedSectionId(undefined); saveSelectedConversation(undefined); localStorage.removeItem("archive-viewer.active-group"); setDialog(undefined); if (remaining[0]) await selectGroup(remaining[0].id); else { setShowHome(false); navigate({ kind: "home" }); }
    }
    catch (error) { setErrors([error instanceof Error ? error.message : "Unable to delete group."]); }
  }
  async function clearAll(): Promise<void> {
    try { setToast(undefined); await clearAllStoredData(); if (active) revokeConversationUrls(active.conversations); setActive(undefined); setGroups([]); setSelectedId(undefined); setSelectedSectionId(undefined); setWarnings([]); setErrors([]); setQuery(""); setTheme("system"); setShowHome(false); setDialog(undefined); navigate({ kind: "home" }); }
    catch (error) { setErrors([error instanceof Error ? error.message : "Unable to clear local data."]); }
  }
  function showToast(message: string, durationMs?: number): void { setToast({ message, durationMs }); }
  function selectConversation(id: string): void { setSelectedId(id); setSelectedSectionId(undefined); setShowStatistics(false); saveSelectedConversation(id); setSidebarOpen(false); setShowHome(false); if (active) navigate({ kind: "conversation", groupId: active.group.id, conversationId: id }); }
  function selectArchiveSection(id: string): void { setSelectedSectionId(id); setShowStatistics(false); setSidebarOpen(false); setShowHome(false); if (active) { const section = active.sections.find((item) => item.id === id); navigate(section?.kind === "profile" || section?.kind === "memories" ? { kind: section.kind, groupId: active.group.id } : { kind: "section", groupId: active.group.id, sectionId: id }); } }
  function showStatisticsPage(): void { setSelectedSectionId(undefined); setShowStatistics(true); setShowHome(false); setSidebarOpen(false); if (active) navigate({ kind: "statistics", groupId: active.group.id }); }
  function toggleSelection(id: string): void {
    if (!active) return;
    const data = { ...active, conversations: active.conversations.map((conversation) => conversation.id === id ? withConversationSelected(conversation, !markedIds.includes(id)) : conversation) };
    setActive(data);
    void saveGroup(data).catch((error: unknown) => setErrors((current) => [...current, error instanceof Error ? error.message : "Unable to save selection."]));
  }
  function updateExportPreferences(preferences: ExportPreferences): void {
    if (!active) return;
    const data = { ...active, group: { ...active.group, exportPreferences: preferences } };
    setActive(data); setGroups((current) => current.map((group) => group.id === data.group.id ? data.group : group));
    void saveGroup(data).catch((error: unknown) => setErrors((current) => [...current, error instanceof Error ? error.message : "Unable to save export preferences."]));
  }
  async function renameConversation(conversationId: string, title: string): Promise<void> {
    if (!active) return;
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const conversation = active.conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.metadata.title === nextTitle) return;
    const data = {
      ...active,
      group: { ...active.group, updatedAt: new Date().toISOString() },
      conversations: active.conversations.map((item) => item.id === conversationId ? { ...item, metadata: { ...item.metadata, title: nextTitle } } : item),
    };
    setActive(data);
    setGroups((current) => current.map((group) => group.id === data.group.id ? data.group : group));
    try { await saveGroup(data); }
    catch (error) { setErrors((current) => [...current, error instanceof Error ? error.message : "Unable to save conversation title."]); }
  }
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
          <div className="collapsed-sidebar-actions"><button type="button" aria-label={t("openSearch")} onClick={() => { setSidebarCollapsed(false); window.setTimeout(() => document.querySelector<HTMLInputElement>(".search input")?.focus(), 0); }}><Icon name="search" /></button><ImportDropzone compact iconOnly disabled={importing} onImport={(selection) => void handleImport(selection)} /></div>
          <ImportDropzone compact disabled={importing} onImport={(selection) => void handleImport(selection)} />
          <button type="button" className={`statistics-nav-button${showStatistics ? " selected" : ""}`} onClick={showStatisticsPage}><Icon name="chart" /><span>{t("statistics")}</span></button>
          <ArchiveSectionNavigation sections={active.sections} selectedId={selectedSectionId} onSelect={selectArchiveSection} />
          {sorted.length > 0 && <><label className="search"><span>{t("search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} /></label>
          <p className="count">{t("conversationCount", { visible: visible.length, total: sorted.length })} · {t("selectedCount", { count: markedIds.length })}</p><ConversationList conversations={visible} selectedId={showHome || showStatistics || selectedSection ? undefined : selected?.id} selectedConversationIds={markedIds} onSelect={selectConversation} onToggleSelection={toggleSelection} /></>}
        </div>
        <GroupSwitcher activeGroup={active.group} groups={groups} onSelect={(id) => void selectGroup(id)} onCreate={() => setDialog("create")} onRename={(id) => { setEditingGroupId(id); setDialog("rename"); }} onDelete={(id) => void removeGroup(id)} onClearAll={() => void clearAll()} onToast={showToast} theme={theme} onThemeChange={setTheme} />
      </aside>
      <div className="reader-wrap"><header className="mobile-reader-bar"><button type="button" aria-label={t("openList")} onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button><span title={showHome ? t("home") : showStatistics ? t("statistics") : selectedSection ? selectedSection.title || archiveSectionLabel(selectedSection.kind, t) : selected?.metadata.title || active.group.name}>{showHome ? t("home") : showStatistics ? t("statistics") : selectedSection ? selectedSection.title || archiveSectionLabel(selectedSection.kind, t) : selected?.metadata.title || active.group.name}</span></header>{showHome ? <ImportHome embedded importing={importing} onImport={(selection) => void handleImport(selection)} /> : showStatistics ? <ArchiveHealth data={active} /> : selectedSection ? <ArchiveSectionReader section={selectedSection} /> : <ConversationReader conversation={selected} allConversations={active.conversations} archiveSections={active.sections} selectedConversationIds={markedIds} exportPreferences={active.group.exportPreferences} onExportPreferencesChange={updateExportPreferences} onTitleChange={(title) => { if (selected) void renameConversation(selected.id, title); }} />}</div>
      {(errors.length > 0 || warnings.length > 0) && <FeedbackQueue floating errors={errors} warnings={warnings} onDismiss={dismissFeedback} />}
    </div>}
    {dialog && <ManagementDialog key={`${dialog}-${editingGroupId || "new"}`} kind={dialog} initialName={dialog === "rename" ? groups.find((group) => group.id === editingGroupId)?.name || "" : ""} initialNote={dialog === "rename" ? groups.find((group) => group.id === editingGroupId)?.note || groups.find((group) => group.id === editingGroupId)?.account?.email || "" : ""} onCancel={() => { setEditingGroupId(undefined); setDialog(undefined); }} onConfirm={confirmDialog} />}
    {pendingImport && <ImportDestinationDialog pending={pendingImport} groups={groups} onCancel={() => setPendingImport(undefined)} onConfirm={(groupId, newGroupName) => { const report = pendingImport.report; setPendingImport(undefined); void commitImport(report, groupId, newGroupName); }} />}
    {toast && <TransientNotice key={toast.message} durationMs={toast.durationMs} onDismiss={() => setToast(undefined)}><div className="action-toast" role="status">{toast.message}</div></TransientNotice>}
  </div>;
}

function FeedbackMessage({ kind, message, onDismiss }: { kind: "error" | "warning" | "info"; message: string; onDismiss?(): void }) {
  return <p className={kind}><span>{message}</span>{onDismiss && <button className="feedback-dismiss" type="button" aria-label="Close" onClick={onDismiss}>×</button>}</p>;
}

function FeedbackQueue({ errors, warnings, onDismiss, floating }: { errors: string[]; warnings: ImportWarning[]; onDismiss?(kind: "error" | "warning", index: number): void; floating?: boolean }) {
  const notices = [
    ...errors.map((message, index) => ({ id: `error-${index}-${message}`, kind: "error" as const, message, onDismiss: onDismiss ? () => onDismiss("error", index) : undefined })),
    ...warnings.map((warning, index) => ({ id: `warning-${index}-${warning.code}-${warning.message}`, kind: warning.code === "IMPORT_MERGED" ? "info" as const : "warning" as const, message: warning.message, onDismiss: onDismiss ? () => onDismiss("warning", index) : undefined })),
  ];
  if (!notices.length) return null;
  const queue = <section className="import-feedback feedback-queue" aria-live="polite">{notices.map((notice, index) => <TransientNotice key={notice.id} active={index === notices.length - 1} durationMs={index === notices.length - 1 ? FEEDBACK_DURATION_MS : 3000} onDismiss={() => notice.onDismiss?.()}><FeedbackMessage kind={notice.kind} message={notice.message} onDismiss={notice.onDismiss} /></TransientNotice>)}</section>;
  return floating ? <div className="feedback-float">{queue}</div> : queue;
}
