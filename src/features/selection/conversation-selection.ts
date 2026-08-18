import type { UniversalConversation } from "../../domain/conversation";

/** Selection is local, deliberately provider-neutral, and saved with the group. */
export function isConversationSelected(conversation: UniversalConversation): boolean {
  const value = conversation.metadata.extra?.selected;
  // Existing favourites become selected on first use, so upgrading does not hide
  // a user's previous shortlist.
  return typeof value === "boolean" ? value : conversation.metadata.extra?.favorite === true;
}

export function withConversationSelected(conversation: UniversalConversation, selected: boolean): UniversalConversation {
  const { favorite: _legacyFavorite, ...extra } = conversation.metadata.extra || {};
  return { ...conversation, metadata: { ...conversation.metadata, extra: { ...extra, selected } } };
}

export function selectedConversationIds(conversations: UniversalConversation[]): string[] {
  return conversations.filter(isConversationSelected).map((conversation) => conversation.id);
}
