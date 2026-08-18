import { useEffect, useRef, useState } from "react";
import type { ConversationGroup } from "../features/groups/group-types";
import type { ThemePreference } from "../lib/theme";
import { Icon, type IconName } from "./Icons";
import { useI18n } from "../lib/i18n";

interface GroupSwitcherProps {
  activeGroup?: ConversationGroup;
  groups: ConversationGroup[];
  onSelect(groupId: string): void;
  onCreate(): void;
  onRename(groupId: string): void;
  onDelete(groupId: string): void;
  onClearAll(): void;
  onToast(message: string): void;
  theme: ThemePreference;
  onThemeChange(theme: ThemePreference): void;
}

function groupInitial(group?: ConversationGroup): string {
  return (group?.name.trim().at(0) || "A").toUpperCase();
}

function groupRemark(group?: ConversationGroup): string | undefined {
  return group?.note || group?.account?.email;
}

export function GroupSwitcher({ activeGroup, groups, onSelect, onCreate, onRename, onDelete, onClearAll, onToast, theme, onThemeChange }: GroupSwitcherProps) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [armedDeleteGroupId, setArmedDeleteGroupId] = useState<string>();
  const [clearArmed, setClearArmed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const armedTimeout = useRef<number | undefined>(undefined);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => () => { if (armedTimeout.current) window.clearTimeout(armedTimeout.current); }, []);

  const action = (callback: () => void) => { setOpen(false); callback(); };
  const confirmDelete = (groupId: string) => {
    if (armedDeleteGroupId === groupId) { if (armedTimeout.current) window.clearTimeout(armedTimeout.current); setArmedDeleteGroupId(undefined); action(() => onDelete(groupId)); return; }
    if (armedTimeout.current) window.clearTimeout(armedTimeout.current);
    setClearArmed(false); setArmedDeleteGroupId(groupId); onToast(t("deleteGroupAgain"));
    armedTimeout.current = window.setTimeout(() => setArmedDeleteGroupId(undefined), 3000);
  };
  const confirmClear = () => {
    if (clearArmed) { if (armedTimeout.current) window.clearTimeout(armedTimeout.current); setClearArmed(false); action(onClearAll); return; }
    if (armedTimeout.current) window.clearTimeout(armedTimeout.current);
    setArmedDeleteGroupId(undefined); setClearArmed(true); onToast(t("clearAllAgain"));
    armedTimeout.current = window.setTimeout(() => setClearArmed(false), 3000);
  };
  return <div className="group-switcher" ref={root}>
    <button type="button" className="group-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="menu" aria-label={t("chooseGroup")}>
      <span className="group-avatar" aria-hidden="true">{groupInitial(activeGroup)}</span>
      <span className="group-trigger-copy"><strong title={activeGroup?.name || t("chooseGroup")}>{activeGroup?.name || t("chooseGroup")}</strong>{groupRemark(activeGroup) && <small title={groupRemark(activeGroup)}>{groupRemark(activeGroup)}</small>}</span><Icon name="settings" />
    </button>
    {open && <div className="group-menu" role="menu">
      <p className="menu-label">{t("groups")}</p>
      <div className="group-options">
        {groups.map((group) => <div key={group.id} className={`group-option-card${group.id === activeGroup?.id ? " active" : ""}`}><button type="button" role="menuitem" className="group-option-select" onClick={() => action(() => onSelect(group.id))}><span className="group-avatar small" aria-hidden="true">{groupInitial(group)}</span><span className="group-option-name" title={group.name}>{group.name}</span></button><div className="group-card-actions"><button type="button" className="group-icon-action" aria-label={t("editGroup")} title={t("editGroup")} onClick={() => action(() => onRename(group.id))}><Icon name="edit" /></button><button type="button" className={`group-icon-action danger-confirm${armedDeleteGroupId === group.id ? " armed" : ""}`} aria-label={t("deleteGroup")} title={t("deleteGroup")} onClick={() => confirmDelete(group.id)}><Icon name="trash" /></button></div></div>)}
      </div>
      <button type="button" className="group-icon-action group-add" aria-label={t("newGroup")} title={t("newGroup")} onClick={() => action(onCreate)}><Icon name="plus" /></button>
      <div className="menu-separator" />
      <div className="theme-picker" role="group" aria-label={t("appearance")}><p className="menu-label">{t("appearance")}</p><div>{(["system", "light", "dark"] as ThemePreference[]).map((option) => { const icon: IconName = option === "system" ? "system" : option === "light" ? "sun" : "moon"; return <button key={option} type="button" className={theme === option ? "active" : ""} onClick={() => action(() => onThemeChange(option))}><Icon name={icon} />{t(option)}</button>; })}</div></div>
      <div className="menu-separator" />
      <div className="language-picker" role="group" aria-label={t("language")}><p className="menu-label">{t("language")}</p><div><button type="button" className={locale === "zh-CN" ? "active" : ""} onClick={() => action(() => setLocale("zh-CN"))}>{t("chinese")}</button><button type="button" className={locale === "en" ? "active" : ""} onClick={() => action(() => setLocale("en"))}>{t("english")}</button></div></div>
      <div className="menu-separator" />
      <button type="button" className={`clear-all${clearArmed ? " armed" : ""}`} onClick={confirmClear}><Icon name="trash" />{t("clearAll")}</button>
    </div>}
  </div>;
}
