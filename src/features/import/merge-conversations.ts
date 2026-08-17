import type { UniversalAttachment, UniversalConversation, UniversalMessage } from "../../domain/conversation";
import { createId } from "../../lib/ids";
import { contentHash, messagePayloadKey, withMessageIdentity } from "./message-identity";

export interface MergeStats {
  addedConversations: number;
  updatedConversations: number;
  addedMessages: number;
  skippedMessages: number;
  revisionMessages: number;
  unresolvedMessages: number;
}

export interface ConversationMergeResult {
  conversations: UniversalConversation[];
  stats: MergeStats;
}

function initialStats(): MergeStats {
  return { addedConversations: 0, updatedConversations: 0, addedMessages: 0, skippedMessages: 0, revisionMessages: 0, unresolvedMessages: 0 };
}

function mergeStats(target: MergeStats, source: MergeStats): void {
  (Object.keys(target) as Array<keyof MergeStats>).forEach((key) => { target[key] += source[key]; });
}

function mergedMetadata<T extends Record<string, unknown>>(existing: T | undefined, incoming: T | undefined): T | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const result: Record<string, unknown> = { ...existing };
  Object.entries(incoming).forEach(([key, value]) => {
    if (result[key] === undefined || result[key] === null || result[key] === "") result[key] = value;
  });
  return result as T;
}

function latestDate(first?: string, second?: string): string | undefined {
  if (!first) return second;
  if (!second) return first;
  return new Date(second).getTime() > new Date(first).getTime() ? second : first;
}

function mergeMessageMetadata(existing: UniversalMessage, incoming: UniversalMessage): UniversalMessage {
  return {
    ...existing,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: latestDate(existing.updatedAt, incoming.updatedAt),
    model: existing.model || incoming.model,
    authorName: existing.authorName || incoming.authorName,
    attachmentIds: existing.attachmentIds || incoming.attachmentIds,
    metadata: mergedMetadata(existing.metadata, incoming.metadata),
  };
}

function attachmentKey(attachment: UniversalAttachment): string {
  return [attachment.sourcePath || "", attachment.name, attachment.size || "", attachment.mimeType || ""].join("\u0000");
}

function mergeAttachments(existing: UniversalAttachment[], incoming: UniversalAttachment[]): UniversalAttachment[] {
  const seen = new Set(existing.map(attachmentKey));
  return [...existing, ...incoming.filter((attachment) => {
    const key = attachmentKey(attachment);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

function deterministicVariantId(sourceMessageId: string, payloadHash: string, parentId?: string): string {
  return `message_${sourceMessageId}_${payloadHash}_${parentId || "root"}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function uniqueId(proposedId: string, usedIds: Set<string>): string {
  if (!usedIds.has(proposedId)) return proposedId;
  let suffix = 2;
  while (usedIds.has(`${proposedId}_${suffix}`)) suffix += 1;
  return `${proposedId}_${suffix}`;
}

function mergeConversation(existing: UniversalConversation, imported: UniversalConversation, importBatchId: string): { conversation: UniversalConversation; stats: MergeStats } {
  const stats = initialStats();
  const messages = existing.messages.map((message) => withMessageIdentity(message));
  const usedIds = new Set(messages.map((message) => message.id));
  const variantsBySource = new Map<string, UniversalMessage[]>();
  messages.forEach((message) => {
    if (!message.sourceMessageId) return;
    variantsBySource.set(message.sourceMessageId, [...(variantsBySource.get(message.sourceMessageId) || []), message]);
  });

  const incomingByOriginalId = new Map(imported.messages.map((message) => [message.id, message]));
  const resolved = new Map<string, string | undefined>();
  const visiting = new Set<string>();

  const resolve = (originalId: string): string | undefined => {
    if (resolved.has(originalId)) return resolved.get(originalId);
    const incoming = incomingByOriginalId.get(originalId);
    if (!incoming || visiting.has(originalId)) return undefined;
    visiting.add(originalId);
    const parentId = incoming.parentMessageId && incomingByOriginalId.has(incoming.parentMessageId)
      ? resolve(incoming.parentMessageId)
      : undefined;
    // When the referenced parent was not part of this snapshot and has several
    // local revisions, keeping it detached is safer than guessing a branch.
    const unresolvedExternalParent = incoming.parentMessageId && !incomingByOriginalId.has(incoming.parentMessageId);
    const finalParentId = unresolvedExternalParent ? incoming.parentMessageId : parentId;
    const candidate = withMessageIdentity(incoming, importBatchId);
    const payload = messagePayloadKey(candidate);
    const sourceMessageId = candidate.sourceMessageId;
    const variants = sourceMessageId ? variantsBySource.get(sourceMessageId) || [] : [];
    const duplicate = variants.find((message) => message.parentMessageId === finalParentId && messagePayloadKey(message) === payload);

    if (duplicate) {
      const index = messages.findIndex((message) => message.id === duplicate.id);
      messages[index] = mergeMessageMetadata(duplicate, candidate);
      stats.skippedMessages += 1;
      resolved.set(originalId, duplicate.id);
      visiting.delete(originalId);
      return duplicate.id;
    }

    const hasRevision = variants.length > 0;
    const id = sourceMessageId
      ? uniqueId(deterministicVariantId(sourceMessageId, contentHash(candidate), finalParentId), usedIds)
      : uniqueId(createId("message"), usedIds);
    const local: UniversalMessage = { ...candidate, id, parentMessageId: finalParentId };
    usedIds.add(id);
    messages.push(local);
    if (sourceMessageId) variantsBySource.set(sourceMessageId, [...variants, local]);
    stats.addedMessages += 1;
    if (hasRevision) stats.revisionMessages += 1;
    if (unresolvedExternalParent) stats.unresolvedMessages += 1;
    resolved.set(originalId, id);
    visiting.delete(originalId);
    return id;
  };

  imported.messages.forEach((message) => resolve(message.id));
  return {
    conversation: {
      ...existing,
      metadata: {
        ...existing.metadata,
        title: existing.metadata.title === "Untitled conversation" ? imported.metadata.title : existing.metadata.title,
        createdAt: existing.metadata.createdAt || imported.metadata.createdAt,
        updatedAt: latestDate(existing.metadata.updatedAt, imported.metadata.updatedAt),
        modelNames: [...new Set([...(existing.metadata.modelNames || []), ...(imported.metadata.modelNames || [])])],
        tags: [...new Set([...(existing.metadata.tags || []), ...(imported.metadata.tags || [])])],
        extra: mergedMetadata(existing.metadata.extra, imported.metadata.extra),
      },
      messages,
      attachments: mergeAttachments(existing.attachments, imported.attachments),
      warnings: [...(existing.warnings || []), ...(imported.warnings || [])],
    },
    stats,
  };
}

function sameSourceConversation(first: UniversalConversation, second: UniversalConversation): boolean {
  return Boolean(first.metadata.sourceConversationId
    && second.metadata.sourceConversationId
    && first.provider.id === second.provider.id
    && first.metadata.sourceConversationId === second.metadata.sourceConversationId);
}

/**
 * Merge imports conservatively: content is deduplicated only in the same parent
 * branch. Same provider IDs with changed content become sibling revisions.
 */
export function mergeConversations(existing: UniversalConversation[], imported: UniversalConversation[], importBatchId: string): ConversationMergeResult {
  const conversations = existing.map((conversation) => ({ ...conversation, messages: [...conversation.messages], attachments: [...conversation.attachments] }));
  const stats = initialStats();
  for (const incoming of imported) {
    const index = conversations.findIndex((conversation) => sameSourceConversation(conversation, incoming));
    if (index === -1) {
      const usedIds = new Set<string>();
      const initial = incoming.messages.map((message) => {
        const identified = withMessageIdentity(message, importBatchId);
        const sourceMessageId = identified.sourceMessageId;
        const id = sourceMessageId ? uniqueId(deterministicVariantId(sourceMessageId, identified.contentHash || contentHash(identified), identified.parentMessageId), usedIds) : uniqueId(createId("message"), usedIds);
        usedIds.add(id);
        return { ...identified, id };
      });
      const sourceToLocal = new Map(incoming.messages.map((message, index) => [message.id, initial[index]!.id]));
      const messages = initial.map((message, index) => {
        const originalParent = incoming.messages[index]!.parentMessageId;
        return { ...message, parentMessageId: originalParent ? sourceToLocal.get(originalParent) || originalParent : undefined };
      });
      conversations.push({ ...incoming, id: createId("conversation"), messages });
      stats.addedConversations += 1;
      stats.addedMessages += messages.length;
      continue;
    }
    const result = mergeConversation(conversations[index]!, incoming, importBatchId);
    conversations[index] = result.conversation;
    stats.updatedConversations += 1;
    mergeStats(stats, result.stats);
  }
  return { conversations, stats };
}
