import type { UniversalConversation } from "../domain/conversation";
import { formatDate } from "../lib/dates";

interface ConversationListProps {
  conversations: UniversalConversation[];
  selectedId?: string;
  onSelect(id: string): void;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  return <nav className="conversation-list" aria-label="Conversations">
    {conversations.map((conversation) => <button
      type="button"
      className={conversation.id === selectedId ? "conversation-item selected" : "conversation-item"}
      key={conversation.id}
      onClick={() => onSelect(conversation.id)}
    >
      <span className="conversation-title">{conversation.metadata.title}</span>
      <span className="conversation-meta">{conversation.provider.name} · {formatDate(conversation.metadata.updatedAt ?? conversation.metadata.createdAt)}</span>
    </button>)}
    {!conversations.length && <p className="empty-list">No conversations match this search.</p>}
  </nav>;
}
