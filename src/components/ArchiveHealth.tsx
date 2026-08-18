import { useMemo } from "react";
import type { GroupData } from "../features/groups/group-types";
import { inspectArchive } from "../features/diagnostics/archive-health";
import { useI18n } from "../lib/i18n";

export function ArchiveHealth({ data }: { data: GroupData }) {
  const { locale } = useI18n();
  const report = useMemo(() => inspectArchive(data.conversations, data.sections), [data]);
  const activity = useMemo(() => {
    const months = new Map<string, number>();
    data.conversations.forEach((conversation) => { const date = conversation.metadata.createdAt || conversation.metadata.updatedAt; if (date) { const month = date.slice(0, 7); months.set(month, (months.get(month) || 0) + 1); } });
    return [...months].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  }, [data.conversations]);
  const topConversations = useMemo(() => [...data.conversations].sort((a, b) => b.messages.length - a.messages.length).slice(0, 8), [data.conversations]);
  const maxActivity = Math.max(1, ...activity.map(([, count]) => count));
  const zh = locale === "zh-CN";
  const labels: Record<string, string> = { conversations: zh ? "对话" : "Conversations", messages: zh ? "消息" : "Messages", attachments: zh ? "附件" : "Attachments", sections: zh ? "资料分区" : "Archive sections", branches: zh ? "分支" : "Branches" };
  return <main className="archive-reader statistics-reader">
    <header><div><h1>{zh ? "统计" : "Statistics"}</h1><p>{zh ? "查看当前分组的对话、消息、导入和活动概览。" : "An overview of conversations, messages, imports, and activity in this group."}</p></div></header>
    <section className="statistics-grid">{Object.entries(report.totals).map(([label, value]) => <article key={label}><strong>{value}</strong><span>{labels[label] || label}</span></article>)}</section>
    {activity.length > 0 && <section className="activity-summary"><h2>{zh ? "近 12 个月活动" : "Last 12 months"}</h2><div>{activity.map(([month, count]) => <article key={month}><span style={{ height: `${Math.max(8, count / maxActivity * 100)}%` }} title={`${month}: ${count}`} /><small>{month.slice(5)}</small></article>)}</div></section>}
    {topConversations.length > 0 && <section className="top-conversations"><h2>{zh ? "消息最多的对话" : "Largest conversations"}</h2>{topConversations.map((conversation) => <p key={conversation.id}><span>{conversation.metadata.title}</span><strong>{conversation.messages.length}</strong></p>)}</section>}
    <section className="import-history"><h2>{zh ? "导入历史" : "Import history"}</h2>{data.batches?.length ? data.batches.map((batch) => <article key={batch.id}><strong>{new Date(batch.importedAt).toLocaleString(locale)}</strong><p>{batch.sourceNames.join(" · ")}</p>{batch.stats && <small>+{batch.stats.addedConversations} conversations · +{batch.stats.addedMessages} messages · {batch.stats.skippedMessages} duplicates · {batch.stats.revisionMessages} revisions</small>}</article>) : <p>{zh ? "旧版导入没有保存历史详情；下一次导入后会显示。" : "Older imports have no stored history details; future imports will appear here."}</p>}</section>
  </main>;
}
