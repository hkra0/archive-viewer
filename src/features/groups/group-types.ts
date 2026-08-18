import type { ArchiveSection, UniversalConversation } from "../../domain/conversation";
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
  /** User-maintained note shown below the group name, for example an e-mail address. */
  note?: string;
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
  sections: ArchiveSection[];
}

export interface GroupImportResult {
  group: ConversationGroup;
  conversations: UniversalConversation[];
  sections: ArchiveSection[];
  batch: ImportBatch;
  stats: MergeStats;
}
