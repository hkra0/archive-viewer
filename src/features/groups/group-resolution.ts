import type { ImportReport } from "../import/import-pipeline";
import type { ConversationGroup, GroupData } from "./group-types";

export interface ImportDestination {
  recommendedGroupId?: string;
  requiresConfirmation: boolean;
}

function normalise(value?: string): string | undefined {
  const output = value?.trim().toLocaleLowerCase();
  return output || undefined;
}

/** Uses e-mail as the only automatic match; display names are a suggestion, not identity proof. */
export function resolveImportDestination(report: ImportReport, groups: ConversationGroup[], current?: GroupData): ImportDestination {
  const email = normalise(report.account?.email);
  if (email) {
    const matches = groups.filter((group) => normalise(group.account?.email) === email);
    if (matches.length === 1) return { recommendedGroupId: matches[0]!.id, requiresConfirmation: false };
    if (matches.length > 1) return { requiresConfirmation: true };
  }
  const name = normalise(report.account?.displayName);
  if (name) {
    const matches = groups.filter((group) => normalise(group.account?.displayName) === name);
    return { recommendedGroupId: matches.length === 1 ? matches[0]!.id : undefined, requiresConfirmation: groups.length > 0 };
  }
  if (!groups.length) return { requiresConfirmation: false };
  if (current) return { recommendedGroupId: current.group.id, requiresConfirmation: false };
  return { requiresConfirmation: true };
}
