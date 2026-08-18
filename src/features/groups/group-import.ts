import { createId } from "../../lib/ids";
import type { ImportReport } from "../import/import-pipeline";
import { mergeConversations } from "../import/merge-conversations";
import type { ConversationGroup, GroupData, GroupImportResult } from "./group-types";

export type GroupNameLocale = "zh-CN" | "en";

export function suggestedGroupName(report: ImportReport, locale: GroupNameLocale = "zh-CN"): string {
  const isSingleConversationFile = report.sourceType === "files" && report.archive.sourceFiles.length === 1 && report.archive.conversations.length === 1;
  if (isSingleConversationFile) return locale === "zh-CN" ? "默认分组" : "Default group";
  if (report.account?.displayName) return report.account.displayName;
  if (report.account?.email) return report.account.email;
  const providers = [...new Set(report.archive.conversations.map((conversation) => conversation.provider.name))];
  if (providers.length === 1 && providers[0]) return locale === "zh-CN" ? `${providers[0]} 导入` : `${providers[0]} import`;
  return locale === "zh-CN" ? "导入分组" : "Imported group";
}

export function newGroupFromImport(report: ImportReport, name?: string, locale?: GroupNameLocale): ConversationGroup {
  const now = new Date().toISOString();
  return {
    id: createId("group"),
    name: name?.trim() || suggestedGroupName(report, locale),
    providerIds: [...new Set(report.archive.conversations.map((conversation) => conversation.provider.id))],
    account: report.account && (report.account.displayName || report.account.email) ? report.account : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeImportIntoGroup(current: GroupData | undefined, report: ImportReport, requestedName?: string, locale?: GroupNameLocale): GroupImportResult {
  const group = current?.group || newGroupFromImport(report, requestedName, locale);
  const batch = {
    id: createId("import"),
    groupId: group.id,
    importedAt: new Date().toISOString(),
    sourceType: report.sourceType,
    sourceNames: report.archive.sourceFiles.map((file) => file.name),
  } as const;
  const merged = mergeConversations(current?.conversations || [], report.archive.conversations, batch.id);
  return {
    group: {
      ...group,
      name: requestedName?.trim() || group.name,
      providerIds: [...new Set([...group.providerIds, ...report.archive.conversations.map((conversation) => conversation.provider.id)])],
      account: group.account || report.account,
      updatedAt: batch.importedAt,
    },
    conversations: merged.conversations,
    batch,
    stats: merged.stats,
  };
}
