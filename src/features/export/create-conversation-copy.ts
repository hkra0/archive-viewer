import type { UniversalConversation, UniversalMessage } from "../../domain/conversation";

export const CONTINUATION_PROMPT = `以下是我与另一个 AI 的历史对话。请完整理解上下文后继续对话：
- 保持已有事实、约束、术语和用户偏好；
- 不要重复已经完成的内容；
- 如果历史中存在缺失或无法确认的信息，请明确指出；
- 请直接回应最后一条用户消息。`;

export interface ConversationCopyOptions {
  includeTitle: boolean;
  includeRoles: boolean;
  includeTimestamps: boolean;
  includeModels: boolean;
  includeMissingPlaceholders: boolean;
  includeContinuationPrompt: boolean;
  continuationPrompt: string;
}

export const DEFAULT_COPY_OPTIONS: ConversationCopyOptions = {
  includeTitle: true,
  includeRoles: true,
  includeTimestamps: false,
  includeModels: false,
  includeMissingPlaceholders: true,
  includeContinuationPrompt: true,
  continuationPrompt: CONTINUATION_PROMPT,
};

function blockText(block: UniversalMessage["content"][number]): string {
  if (block.type === "markdown") return block.markdown;
  if (block.type === "text") return block.text;
  if (block.type === "code") return `\`\`\`${block.language || ""}\n${block.code}\n\`\`\``;
  if (block.type === "image") return `[Image: ${block.alt || block.attachmentId}]`;
  if (block.type === "file") return `[File: ${block.attachmentId}]`;
  if (block.type === "tool-call") return `[Tool call: ${block.name}]\n\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\``;
  if (block.type === "tool-result") return `[Tool result${block.name ? `: ${block.name}` : ""}]\n\`\`\`json\n${JSON.stringify(block.output, null, 2)}\n\`\`\``;
  return `[Unrecognised exported content]\n\`\`\`json\n${JSON.stringify(block.raw, null, 2)}\n\`\`\``;
}

function messageText(message: UniversalMessage, options: ConversationCopyOptions): string {
  const metadata: string[] = [];
  if (options.includeRoles) metadata.push(message.authorName || message.role);
  if (options.includeTimestamps && message.createdAt) metadata.push(message.createdAt);
  if (options.includeModels && message.model) metadata.push(message.model);
  const body = message.content.map(blockText).filter(Boolean).join("\n\n");
  return metadata.length ? `### ${metadata.join(" · ")}\n\n${body}` : body;
}

export function createConversationCopy(conversation: UniversalConversation, messages: UniversalMessage[], options: ConversationCopyOptions): string {
  const sections: string[] = [];
  if (options.includeContinuationPrompt && options.continuationPrompt.trim()) {
    sections.push(`## Continuation prompt\n\n${options.continuationPrompt.trim()}`);
  }
  if (options.includeTitle) sections.push(`# ${conversation.metadata.title}`);
  const includedMessages = messages.filter((message) => options.includeMissingPlaceholders || message.metadata?.missingFromExport !== true);
  sections.push(includedMessages.map((message) => messageText(message, options)).filter(Boolean).join("\n\n---\n\n"));
  return sections.filter(Boolean).join("\n\n").trim() + "\n";
}
