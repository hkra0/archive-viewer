import type { UniversalConversation, UniversalMessage } from "../domain/conversation";
import { formatDate } from "../lib/dates";
import { MarkdownContent } from "./MarkdownContent";

function MessageBody({ message, conversation }: { message: UniversalMessage; conversation: UniversalConversation }) {
  return <>{message.content.map((block, index) => {
    if (block.type === "markdown") return <MarkdownContent key={index} markdown={block.markdown} attachments={conversation.attachments} />;
    if (block.type === "text") return <p key={index}>{block.text}</p>;
    if (block.type === "code") return <pre key={index}><code className={`language-${block.language || "markup"}`}>{block.code}</code></pre>;
    if (block.type === "image") {
      const attachment = conversation.attachments.find((item) => item.id === block.attachmentId);
      return attachment?.objectUrl ? <img key={index} className="message-image" src={attachment.objectUrl} alt={block.alt || attachment.name} /> : <p key={index}>Attachment: {attachment?.name || "missing"}</p>;
    }
    if (block.type === "file") return <p key={index}>Attached file: {conversation.attachments.find((item) => item.id === block.attachmentId)?.name || "missing"}</p>;
    return <details key={index}><summary>Unrecognised exported content</summary><pre>{JSON.stringify(block, null, 2)}</pre></details>;
  })}</>;
}

export function ConversationReader({ conversation }: { conversation?: UniversalConversation }) {
  if (!conversation) return <main className="reader empty-reader"><p>Import an export, then select a conversation to start reading.</p></main>;
  return <main className="reader">
    <header className="reader-header">
      <p className="eyebrow">{conversation.provider.name}</p>
      <h1>{conversation.metadata.title}</h1>
      <p>{conversation.messages.length} messages · {formatDate(conversation.metadata.updatedAt ?? conversation.metadata.createdAt)}</p>
    </header>
    <section className="messages" aria-label="Conversation messages">
      {conversation.messages.map((message) => <article key={message.id} className={`message ${message.role}`}>
        <header><strong>{message.authorName || message.role}</strong><time>{formatDate(message.createdAt)}</time></header>
        <div className="message-body"><MessageBody message={message} conversation={conversation} /></div>
      </article>)}
      {!conversation.messages.length && <p>No readable messages were found in this conversation.</p>}
    </section>
  </main>;
}
