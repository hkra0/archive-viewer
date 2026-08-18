import type { UniversalConversation } from "../domain/conversation";
import { formatDate } from "../lib/dates";
import { useI18n } from "../lib/i18n";

interface ConversationListProps {
  conversations: UniversalConversation[];
  selectedId?: string;
  onSelect(id: string): void;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  const { locale, t } = useI18n();
  return <nav className="conversation-list" aria-label={t("conversationList")}>
    {conversations.map((conversation) => <button
      type="button"
      className={conversation.id === selectedId ? "conversation-item selected" : "conversation-item"}
      key={conversation.id}
      onClick={() => onSelect(conversation.id)}
    >
      <span className="conversation-title" title={conversation.metadata.title}>{conversation.metadata.title}</span>
      <span className="conversation-meta">{conversation.provider.name} · {formatDate(conversation.metadata.updatedAt ?? conversation.metadata.createdAt, locale, t("unknownDate"))}</span>
    </button>)}
    {!conversations.length && <p className="empty-list">{t("noMatches")}</p>}
  </nav>;
}
