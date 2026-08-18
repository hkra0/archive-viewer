import type { ArchiveSection, UniversalConversation } from "../../domain/conversation";
import type { MergeStats } from "../import/merge-conversations";

export interface GroupAccount {
  displayName?: string;
  email?: string;
}

export interface ExportPreferences {
  conversationExportOptions?: { includeTitle: boolean; includeRoles: boolean; includeTimestamps: boolean; includeModels: boolean; includeMissingPlaceholders: boolean; includeContinuationPrompt: boolean; continuationPrompt: string };
  /** @deprecated Read only to migrate export preferences saved before this rename. */
  conversationCopyOptions?: { includeTitle: boolean; includeRoles: boolean; includeTimestamps: boolean; includeModels: boolean; includeMissingPlaceholders: boolean; includeContinuationPrompt: boolean; continuationPrompt: string };
  /** Profile and memories included with an individual conversation. */
  conversationArchiveOptions?: { includeProfile: boolean; includeMemories: boolean };
  /** Profile and memories included with a ZIP export. */
  groupArchiveOptions?: { includeProfile: boolean; includeMemories: boolean };
  groupExportScope?: "selected" | "unselected" | "all";
}

export interface ConversationGroup {
  id: string;
  name: string;
  providerIds: string[];
  account?: GroupAccount;
  /** User-maintained note shown below the group name, for example an e-mail address. */
  note?: string;
  exportPreferences?: ExportPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  groupId: string;
  importedAt: string;
  sourceType: "zip" | "folder" | "files";
  sourceNames: string[];
  sourceFiles?: Array<{ name: string; size: number; lastModified?: number }>;
  stats?: MergeStats;
}

export interface GroupData {
  group: ConversationGroup;
  conversations: UniversalConversation[];
  sections: ArchiveSection[];
  batches?: ImportBatch[];
}

export interface GroupImportResult {
  group: ConversationGroup;
  conversations: UniversalConversation[];
  sections: ArchiveSection[];
  batch: ImportBatch;
  stats: MergeStats;
}
