import { useState } from "react";
import type { ArchiveSection, UniversalAttachment, UniversalConversation } from "../domain/conversation";
import { formatDate } from "../lib/dates";
import { useI18n } from "../lib/i18n";
import { Icon, type IconName } from "./Icons";
import { MarkdownContent } from "./MarkdownContent";

const icons: Record<ArchiveSection["kind"], IconName> = {
  profile: "user", projects: "folder", memories: "memory", tasks: "tasks", assistants: "spark", instructions: "settings", library: "image", other: "folder",
};

export function archiveSectionLabel(kind: ArchiveSection["kind"], t: ReturnType<typeof useI18n>["t"]): string {
  const keys = { profile: "profile", projects: "projects", memories: "memories", tasks: "tasks", assistants: "assistants", instructions: "customInstructions", library: "library", other: "otherData" } as const;
  return t(keys[kind]);
}

export function ArchiveSectionNavigation({ sections, selectedId, onSelect }: { sections: ArchiveSection[]; selectedId?: string; onSelect(id: string): void }) {
  const { t } = useI18n();
  if (!sections.length) return null;
  return <nav className="archive-section-nav" aria-label={t("archiveData")}>
    {[...sections].sort((a, b) => Number(a.kind === "other") - Number(b.kind === "other")).map((section) => <button key={section.id} type="button" className={selectedId === section.id ? "selected" : ""} onClick={() => onSelect(section.id)}>
      <Icon name={icons[section.kind]} /><span>{section.title || archiveSectionLabel(section.kind, t)}</span><small>{section.items.length}</small>
    </button>)}
  </nav>;
}

function libraryAttachment(itemId: string, conversations: UniversalConversation[]): UniversalAttachment | undefined {
  return conversations.flatMap((conversation) => conversation.attachments).find((attachment) => attachment.id === itemId);
}

function chatGptRawRecord(section: ArchiveSection, item: ArchiveSection["items"][number]): unknown | undefined {
  if (item.raw !== undefined) return item.raw;
  // Existing local imports stored supplemental ChatGPT data in `body`. Read it as
  // structured data so they gain the quieter UI without needing a re-import.
  if (section.providerId !== "chatgpt" || !item.body) return undefined;
  try { return JSON.parse(item.body); } catch { return undefined; }
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 2)} MB`;
}

function librarySize(item: ArchiveSection["items"][number], attachment?: UniversalAttachment): number | undefined {
  if (attachment?.size !== undefined) return attachment.size;
  if (item.raw && typeof item.raw === "object" && !Array.isArray(item.raw) && typeof (item.raw as Record<string, unknown>).file_size_bytes === "number") return (item.raw as Record<string, unknown>).file_size_bytes as number;
  return undefined;
}

export function ArchiveSectionReader({ section, conversations = [] }: { section: ArchiveSection; conversations?: UniversalConversation[] }) {
  const { locale, t } = useI18n();
  const title = section.title || archiveSectionLabel(section.kind, t);
  const [copiedItemId, setCopiedItemId] = useState<string>();
  const [failedItemId, setFailedItemId] = useState<string>();
  const [libraryView, setLibraryView] = useState<"grid" | "list">("grid");
  const [expandedImage, setExpandedImage] = useState<{ src: string; name: string }>();
  const isLibrary = section.kind === "library";
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
    <header><span className="archive-reader-icon"><Icon name={icons[section.kind]} /></span><div><h1>{title}</h1><p>{t("archiveItemCount", { count: section.items.length })}</p></div>{isLibrary && <div className="library-view-toggle" aria-label={t("libraryView")}><button type="button" className={libraryView === "grid" ? "selected" : ""} aria-pressed={libraryView === "grid"} title={t("libraryGrid")} onClick={() => setLibraryView("grid")}><Icon name="grid" /></button><button type="button" className={libraryView === "list" ? "selected" : ""} aria-pressed={libraryView === "list"} title={t("libraryList")} onClick={() => setLibraryView("list")}><Icon name="list" /></button></div>}</header>
    <div className={`archive-cards ${section.kind}${isLibrary ? ` library-${libraryView}` : ""}`}>
      {isLibrary && libraryView === "list" && <div className="library-list-head"><span>{t("libraryName")}</span><span>{t("libraryModified")}</span><span>{t("librarySize")}</span></div>}
      {section.items.map((item, index) => {
        const itemKey = `${section.id}:${item.id}:${index}`;
        const showHeading = item.title || section.items.length > 1 || (section.kind === "memories" && item.body);
        const source = item.fields?.Source;
        const fields = Object.entries(item.fields || {}).filter(([label]) => label !== "Source");
        const date = item.updatedAt || item.createdAt;
        const attachment = section.id === "chatgpt-library" ? libraryAttachment(item.fields?.["File ID"] || item.id, conversations) : undefined;
        const rawRecord = chatGptRawRecord(section, item);
        const raw = rawRecord === undefined ? undefined : JSON.stringify(rawRecord, null, 2);
        const body = rawRecord === undefined ? item.body : undefined;
        const status = item.fields?.Status?.toLowerCase() === "ready" ? undefined : item.fields?.Status;
        const imageSource = attachment && /^image\//.test(attachment.mimeType || "") ? attachment.objectUrl : undefined;
        if (isLibrary) {
          const name = item.title || t("archiveItem", { count: index + 1 });
          const thumbnail = <div className={`library-thumbnail${status && !imageSource ? " library-status" : ""}`}>{imageSource ? <button type="button" onClick={() => setExpandedImage({ src: imageSource, name })} aria-label={t("expandImage")}><img src={imageSource} alt={name} /></button> : status ? <small>{status}</small> : <Icon name="image" />}</div>;
          return libraryView === "grid"
            ? <article className="library-item library-item-grid" key={`${item.id}-${index}`}>{thumbnail}<div className="library-grid-overlay"><span>{name}</span><time>{date ? formatDate(date, locale, t("unknownDate")) : t("unknownDate")}</time></div></article>
            : <article className="library-item library-item-list" key={`${item.id}-${index}`}>{thumbnail}<div className="library-name"><span title={item.title}>{name}</span></div><time>{date ? formatDate(date, locale, t("unknownDate")) : "—"}</time><span className="library-size">{formatFileSize(librarySize(item, attachment))}</span></article>;
        }
        return <div className="archive-card-stack" key={`${item.id}-${index}`}>
          <article className="archive-card">
            {showHeading && <div className="archive-card-heading">
              {(item.title || section.items.length > 1) && <h2>{item.title || t("archiveItem", { count: index + 1 })}</h2>}
            </div>}
            {attachment && /^image\//.test(attachment.mimeType || "") && attachment.objectUrl && <img className="archive-library-image" src={attachment.objectUrl} alt={attachment.name} />}
            {attachment && !/^image\//.test(attachment.mimeType || "") && attachment.objectUrl && <a className="archive-library-download" href={attachment.objectUrl} download={attachment.name}>{t("downloadAttachment")}</a>}
            {body && <div className="archive-card-body"><MarkdownContent markdown={body} attachments={[]} /></div>}
            {fields.length > 0 && <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
            {raw && <details className="archive-raw-data"><summary>{t("viewRawData")}</summary><pre><code>{raw}</code></pre></details>}
          </article>
          {(source || (section.kind === "memories" && item.body) || date) && <footer className="archive-card-footer">
            {(source || (section.kind === "memories" && item.body)) && <div className="archive-card-actions">
              {section.kind === "memories" && item.body && <button className="quiet-button archive-copy-button" type="button" onClick={() => void copyMemory(itemKey, item.body!)} aria-label={copiedItemId === itemKey ? t("copied") : failedItemId === itemKey ? t("copyFailed") : t("copyMemory")} title={t("copyMemory")}><Icon name="copy" /></button>}
              {source && <span className="archive-source">{source}</span>}
            </div>}
            {date && <time>{formatDate(date, locale, t("unknownDate"))}</time>}
          </footer>}
        </div>;
      })}
    </div>
    {expandedImage && <div className="library-image-modal" role="dialog" aria-modal="true" aria-label={expandedImage.name} onClick={() => setExpandedImage(undefined)}><button type="button" className="library-image-modal-close" aria-label={t("closeImage")} onClick={() => setExpandedImage(undefined)}>×</button><img src={expandedImage.src} alt={expandedImage.name} onClick={(event) => event.stopPropagation()} /></div>}
  </main>;
}
