import type { UniversalAttachment, UniversalConversation } from "../../domain/conversation";
import { annotateArchiveSectionSources, mergeArchiveSections } from "../import/archive-sections";
import type { ConversationGroup, GroupData, ImportBatch } from "./group-types";
import { THEME_STORAGE_KEY } from "../../lib/theme";

const DATABASE_NAME = "archive-viewer";
const DATABASE_VERSION = 2;
const GROUPS = "groups";
const CONVERSATIONS = "conversations";
const BATCHES = "batches";
const ARCHIVE_SECTIONS = "archive-sections";

interface StoredConversation {
  key: string;
  groupId: string;
  conversation: UniversalConversation;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(GROUPS)) database.createObjectStore(GROUPS, { keyPath: "id" });
      if (!database.objectStoreNames.contains(CONVERSATIONS)) {
        const store = database.createObjectStore(CONVERSATIONS, { keyPath: "key" });
        store.createIndex("groupId", "groupId", { unique: false });
      }
      if (!database.objectStoreNames.contains(BATCHES)) {
        const store = database.createObjectStore(BATCHES, { keyPath: "id" });
        store.createIndex("groupId", "groupId", { unique: false });
      }
      if (!database.objectStoreNames.contains(ARCHIVE_SECTIONS)) database.createObjectStore(ARCHIVE_SECTIONS, { keyPath: "groupId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地数据库。"));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地数据操作失败。"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("本地数据操作被取消。"));
    transaction.onerror = () => reject(transaction.error || new Error("本地数据操作失败。"));
  });
}

function persistedConversation(conversation: UniversalConversation): UniversalConversation {
  return {
    ...conversation,
    attachments: conversation.attachments.map(({ objectUrl: _objectUrl, ...attachment }) => attachment),
  };
}

function hydratedAttachment(attachment: UniversalAttachment): UniversalAttachment {
  return attachment.blob ? { ...attachment, objectUrl: URL.createObjectURL(attachment.blob) } : attachment;
}

export function hydrateConversation(conversation: UniversalConversation): UniversalConversation {
  return { ...conversation, attachments: conversation.attachments.map(hydratedAttachment) };
}

export function revokeConversationUrls(conversations: UniversalConversation[]): void {
  conversations.flatMap((conversation) => conversation.attachments)
    .forEach((attachment) => { if (attachment.objectUrl) URL.revokeObjectURL(attachment.objectUrl); });
}

function groupConversationKey(groupId: string, conversationId: string): string {
  return `${groupId}:${conversationId}`;
}

export async function listGroups(): Promise<ConversationGroup[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(GROUPS, "readonly");
    const groups = await requestValue(transaction.objectStore(GROUPS).getAll()) as ConversationGroup[];
    await transactionDone(transaction);
    return groups.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } finally {
    database.close();
  }
}

export async function loadGroup(groupId: string): Promise<GroupData | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([GROUPS, CONVERSATIONS, ARCHIVE_SECTIONS, BATCHES], "readonly");
    const group = await requestValue(transaction.objectStore(GROUPS).get(groupId)) as ConversationGroup | undefined;
    if (!group) {
      await transactionDone(transaction);
      return undefined;
    }
    const records = await requestValue(transaction.objectStore(CONVERSATIONS).index("groupId").getAll(IDBKeyRange.only(groupId))) as StoredConversation[];
    const sectionRecord = await requestValue(transaction.objectStore(ARCHIVE_SECTIONS).get(groupId)) as { groupId: string; sections: GroupData["sections"] } | undefined;
    const batches = await requestValue(transaction.objectStore(BATCHES).index("groupId").getAll(IDBKeyRange.only(groupId))) as ImportBatch[];
    await transactionDone(transaction);
    const conversations = records.map((record) => hydrateConversation(record.conversation));
    // Normalise older groups in memory too, so profile navigation is repaired
    // immediately instead of requiring another import to trigger a merge.
    const normalisedSections = mergeArchiveSections([], sectionRecord?.sections || []);
    const providerIds = [...new Set(conversations.map((conversation) => conversation.provider.id).filter((id) => id !== "generic"))];
    const sections = providerIds.length === 1 ? annotateArchiveSectionSources(normalisedSections, providerIds[0]) : normalisedSections;
    return { group, conversations, sections, batches: batches.sort((a, b) => b.importedAt.localeCompare(a.importedAt)) };
  } finally {
    database.close();
  }
}

export async function saveGroup(data: GroupData, batch?: ImportBatch): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([GROUPS, CONVERSATIONS, BATCHES, ARCHIVE_SECTIONS], "readwrite");
    const groups = transaction.objectStore(GROUPS);
    const conversations = transaction.objectStore(CONVERSATIONS);
    groups.put(data.group);
    const index = conversations.index("groupId");
    const existing = await requestValue(index.getAllKeys(IDBKeyRange.only(data.group.id)));
    existing.forEach((key) => conversations.delete(key));
    data.conversations.forEach((conversation) => conversations.put({
      key: groupConversationKey(data.group.id, conversation.id),
      groupId: data.group.id,
      conversation: persistedConversation(conversation),
    } satisfies StoredConversation));
    transaction.objectStore(ARCHIVE_SECTIONS).put({ groupId: data.group.id, sections: data.sections || [] });
    if (batch) transaction.objectStore(BATCHES).put(batch);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteGroup(groupId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([GROUPS, CONVERSATIONS, BATCHES, ARCHIVE_SECTIONS], "readwrite");
    transaction.objectStore(GROUPS).delete(groupId);
    transaction.objectStore(ARCHIVE_SECTIONS).delete(groupId);
    for (const storeName of [CONVERSATIONS, BATCHES] as const) {
      const store = transaction.objectStore(storeName);
      const keys = await requestValue(store.index("groupId").getAllKeys(IDBKeyRange.only(groupId)));
      keys.forEach((key) => store.delete(key));
    }
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function clearAllStoredData(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("无法清除本地数据。"));
    request.onblocked = () => reject(new Error("请关闭其他打开此应用的标签页后重试。"));
  });
  localStorage.removeItem("archive-viewer.active-group");
  localStorage.removeItem("archive-viewer.active-conversation");
  localStorage.removeItem(THEME_STORAGE_KEY);
}
