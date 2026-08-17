import type { UniversalConversation } from "../../domain/conversation";
import type { MergeStats } from "../import/merge-conversations";

export interface GroupAccount {
  displayName?: string;
  email?: string;
}

export interface ConversationGroup {
  id: string;
  name: string;
  providerIds: string[];
  account?: GroupAccount;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  groupId: string;
  importedAt: string;
  sourceType: "zip" | "folder" | "files";
  sourceNames: string[];
}

export interface GroupData {
  group: ConversationGroup;
  conversations: UniversalConversation[];
}

export interface GroupImportResult {
  group: ConversationGroup;
  conversations: UniversalConversation[];
  batch: ImportBatch;
  stats: MergeStats;
}
