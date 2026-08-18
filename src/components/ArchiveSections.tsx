import { useState } from "react";
import type { ArchiveSection } from "../domain/conversation";
import { formatDate } from "../lib/dates";
import { useI18n } from "../lib/i18n";
import { Icon, type IconName } from "./Icons";
import { MarkdownContent } from "./MarkdownContent";

const icons: Record<ArchiveSection["kind"], IconName> = {
  profile: "user", projects: "folder", memories: "memory", tasks: "tasks", assistants: "spark", instructions: "settings", other: "folder",
};

export function archiveSectionLabel(kind: ArchiveSection["kind"], t: ReturnType<typeof useI18n>["t"]): string {
  const keys = { profile: "profile", projects: "projects", memories: "memories", tasks: "tasks", assistants: "assistants", instructions: "customInstructions", other: "otherData" } as const;
  return t(keys[kind]);
}

export function ArchiveSectionNavigation({ sections, selectedId, onSelect }: { sections: ArchiveSection[]; selectedId?: string; onSelect(id: string): void }) {
  const { t } = useI18n();
  if (!sections.length) return null;
  return <nav className="archive-section-nav" aria-label={t("archiveData")}>
    {sections.map((section) => <button key={section.id} type="button" className={selectedId === section.id ? "selected" : ""} onClick={() => onSelect(section.id)}>
      <Icon name={icons[section.kind]} /><span>{section.title || archiveSectionLabel(section.kind, t)}</span><small>{section.items.length}</small>
    </button>)}
  </nav>;
}

export function ArchiveSectionReader({ section }: { section: ArchiveSection }) {
  const { locale, t } = useI18n();
  const title = section.title || archiveSectionLabel(section.kind, t);
  const [copiedItemId, setCopiedItemId] = useState<string>();
  const [failedItemId, setFailedItemId] = useState<string>();
  const copyMemory = async (itemId: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedItemId(itemId);
      setFailedItemId(undefined);
    } catch {
      setFailedItemId(itemId);
      setCopiedItemId(undefined);
    }
  };
  return <main className="archive-reader">
    <header><span className="archive-reader-icon"><Icon name={icons[section.kind]} /></span><div><h1>{title}</h1><p>{t("archiveItemCount", { count: section.items.length })}</p></div></header>
    <div className={`archive-cards ${section.kind}`}>
      {section.items.map((item, index) => {
        const itemKey = `${section.id}:${item.id}:${index}`;
        const showHeading = item.title || section.items.length > 1 || (section.kind === "memories" && item.body);
        return <article className="archive-card" key={`${item.id}-${index}`}>
        {showHeading && <div className="archive-card-heading">
          {(item.title || section.items.length > 1) && <h2>{item.title || t("archiveItem", { count: index + 1 })}</h2>}
          {section.kind === "memories" && item.body && <button className="quiet-button archive-copy-button" type="button" onClick={() => void copyMemory(itemKey, item.body!)} aria-label={copiedItemId === itemKey ? t("copied") : failedItemId === itemKey ? t("copyFailed") : t("copyMemory")} title={t("copyMemory")}><Icon name="copy" /></button>}
        </div>}
        {item.body && <div className="archive-card-body"><MarkdownContent markdown={item.body} attachments={[]} /></div>}
        {item.fields && <dl>{Object.entries(item.fields).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        {(item.updatedAt || item.createdAt) && <footer>{formatDate(item.updatedAt || item.createdAt, locale, t("unknownDate"))}</footer>}
      </article>;
      })}
    </div>
  </main>;
}
