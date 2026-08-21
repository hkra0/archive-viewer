import type { UniversalConversation } from "../domain/conversation";
import { hasReadableConversationContent } from "../domain/conversation-content";
import { formatDate } from "../lib/dates";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icons";

interface ConversationListProps {
  conversations: UniversalConversation[];
  selectedId?: string;
  onSelect(id: string): void;
  selectedConversationIds?: string[];
  onToggleSelection?(id: string): void;
}

export function ConversationList({ conversations, selectedId, selectedConversationIds = [], onSelect, onToggleSelection }: ConversationListProps) {
  const { locale, t } = useI18n();
  // Library assets are reachable from the dedicated Library section; the synthetic
  // backing conversation should not clutter the user's real chat history.
  const visibleConversations = conversations.filter((conversation) => conversation.metadata.extra?.chatgptLibrary !== true);
  const readable = visibleConversations.filter(hasReadableConversationContent);
  const empty = visibleConversations.filter((conversation) => !hasReadableConversationContent(conversation));
  const renderConversation = (conversation: UniversalConversation) => <div
    className={`conversation-item${conversation.id === selectedId ? " selected" : ""}${selectedConversationIds.includes(conversation.id) ? " marked" : ""}`}
    key={conversation.id}
  >
    <button type="button" className="conversation-select" onClick={() => onSelect(conversation.id)}><span className="conversation-title" title={conversation.metadata.title}>{conversation.metadata.title}{conversation.metadata.extra?.chatgptShared === true && <Icon name="share" className="shared-conversation-mark" />}</span><span className="conversation-meta">{conversation.provider.name} · {formatDate(conversation.metadata.updatedAt ?? conversation.metadata.createdAt, locale, t("unknownDate"))}</span></button>
    {onToggleSelection && <button type="button" className="selection-marker" aria-pressed={selectedConversationIds.includes(conversation.id)} aria-label={selectedConversationIds.includes(conversation.id) ? t("unmarkConversation") : t("markConversation")} title={selectedConversationIds.includes(conversation.id) ? t("unmarkConversation") : t("markConversation")} onClick={() => onToggleSelection(conversation.id)}><Icon name={selectedConversationIds.includes(conversation.id) ? "check-square" : "square"} /></button>}
  </div>;
  return <nav className="conversation-list" aria-label={t("conversationList")}>
    {readable.map(renderConversation)}
    {empty.length > 0 && <details className="collapsed-empty-conversations"><summary>{t("collapsedEmptyConversations", { count: empty.length })}</summary><div>{empty.map(renderConversation)}</div></details>}
    {!visibleConversations.length && <p className="empty-list">{t("noMatches")}</p>}
  </nav>;
}
