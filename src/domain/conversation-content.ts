import type { MessageContentBlock, UniversalConversation } from "./conversation";

/** Whether a content block gives the reader something meaningful to display. */
export function isReadableMessageContent(block: MessageContentBlock): boolean {
  if (block.type === "text") return Boolean(block.text.trim());
  if (block.type === "markdown") return Boolean(block.markdown.trim());
  if (block.type === "code") return Boolean(block.code.trim());
  if (block.type === "thinking") return Boolean(block.thinking.trim());
  if (block.type === "tool-call" || block.type === "tool-result") return true;
  return block.type === "image" || block.type === "file";
}

/** Empty placeholders are retained in storage, but are not readable conversation content. */
export function hasReadableConversationContent(conversation: UniversalConversation): boolean {
  return conversation.messages.some((message) => message.content.some(isReadableMessageContent));
}
