import MiniSearch from "minisearch";
import type { UniversalConversation } from "../../domain/conversation";

interface SearchDocument {
  id: string;
  title: string;
  body: string;
}

function contentText(conversation: UniversalConversation): string {
  return conversation.messages.flatMap((message) => message.content.map((block) => {
    if (block.type === "markdown") return block.markdown;
    if (block.type === "text") return block.text;
    if (block.type === "code") return block.code;
    return "";
  })).join(" ");
}

/** Creates an ephemeral search index; it is rebuilt in memory after each import. */
export function searchConversations(conversations: UniversalConversation[], query: string): Set<string> {
  if (!query.trim()) return new Set(conversations.map((conversation) => conversation.id));
  const index = new MiniSearch<SearchDocument>({ fields: ["title", "body"], storeFields: ["id"] });
  index.addAll(conversations.map((conversation) => ({ id: conversation.id, title: conversation.metadata.title, body: contentText(conversation) })));
  return new Set(index.search(query, { prefix: true, fuzzy: 0.2 }).map((result) => result.id));
}
