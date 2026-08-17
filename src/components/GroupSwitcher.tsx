import { useEffect, useRef, useState } from "react";
import type { ConversationGroup } from "../features/groups/group-types";
import type { ThemePreference } from "../lib/theme";

interface GroupSwitcherProps {
  activeGroup?: ConversationGroup;
  groups: ConversationGroup[];
  onSelect(groupId: string): void;
  onCreate(): void;
  onRename(): void;
  onDelete(): void;
  onClearAll(): void;
  theme: ThemePreference;
  onThemeChange(theme: ThemePreference): void;
}

function groupInitial(group?: ConversationGroup): string {
  return (group?.name.trim().at(0) || "A").toUpperCase();
}

export function GroupSwitcher({ activeGroup, groups, onSelect, onCreate, onRename, onDelete, onClearAll, theme, onThemeChange }: GroupSwitcherProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const action = (callback: () => void) => { setOpen(false); callback(); };
  return <div className="group-switcher" ref={root}>
    <button type="button" className="group-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="menu">
      <span className="group-avatar" aria-hidden="true">{groupInitial(activeGroup)}</span>
      <span className="group-trigger-copy"><strong>{activeGroup?.name || "选择分组"}</strong>{activeGroup?.account?.email && <small>{activeGroup.account.email}</small>}</span>
      <span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="group-menu" role="menu">
      <p className="menu-label">分组</p>
      <div className="group-options">
        {groups.map((group) => <button key={group.id} type="button" role="menuitem" className={group.id === activeGroup?.id ? "active" : ""} onClick={() => action(() => onSelect(group.id))}>
          <span className="group-avatar small" aria-hidden="true">{groupInitial(group)}</span><span>{group.name}</span>
        </button>)}
      </div>
      <div className="menu-separator" />
      <button type="button" role="menuitem" onClick={() => action(onCreate)}>新增分组</button>
      {activeGroup && <button type="button" role="menuitem" onClick={() => action(onRename)}>重命名分组</button>}
      {activeGroup && <button type="button" role="menuitem" className="danger" onClick={() => action(onDelete)}>删除当前分组</button>}
      <div className="menu-separator" />
      <div className="theme-picker" role="group" aria-label="外观主题">
        <p className="menu-label">外观</p>
        <div>{(["system", "light", "dark"] as ThemePreference[]).map((option) => <button key={option} type="button" className={theme === option ? "active" : ""} onClick={() => action(() => onThemeChange(option))}>{option === "system" ? "跟随系统" : option === "light" ? "浅色" : "深色"}</button>)}</div>
      </div>
      <div className="menu-separator" />
      <button type="button" role="menuitem" className="danger" onClick={() => action(onClearAll)}>清除所有本地数据</button>
    </div>}
  </div>;
}
