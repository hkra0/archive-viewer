import type { UniversalConversation, UniversalMessage } from "../../domain/conversation";

export const CONTINUATION_PROMPTS = {
  "zh-CN": `以下是我与另一个 AI 的历史对话。请完整理解上下文后继续对话：
- 保持已有事实、约束、术语和用户偏好；
- 不要重复已经完成的内容；
- 如果历史中存在缺失或无法确认的信息，请明确指出；
- 请直接回应最后一条用户消息。`,
  en: `Below is my conversation history with another AI. Fully understand the context before continuing:
- Preserve established facts, constraints, terminology, and user preferences.
- Do not repeat work that has already been completed.
- Clearly identify anything missing or uncertain in the history.
- Respond directly to the final user message.`,
} as const;

export type ContinuationPromptLocale = keyof typeof CONTINUATION_PROMPTS;
export const CONTINUATION_PROMPT = CONTINUATION_PROMPTS["zh-CN"];

export function continuationPromptForLocale(locale: ContinuationPromptLocale): string {
  return CONTINUATION_PROMPTS[locale];
}

export interface ConversationExportOptions {
  includeTitle: boolean;
  includeRoles: boolean;
  includeTimestamps: boolean;
  includeModels: boolean;
  includeMissingPlaceholders: boolean;
  includeContinuationPrompt: boolean;
  continuationPrompt: string;
}

export const DEFAULT_EXPORT_OPTIONS: ConversationExportOptions = {
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
  if (block.type === "thinking") return `<details>\n<summary>Thinking${block.summaries?.length ? ` — ${block.summaries.join("; ")}` : ""}</summary>\n\n${block.thinking}\n\n</details>`;
  if (block.type === "tool-call") return `[Tool call: ${block.name}]\n\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\``;
  if (block.type === "tool-result") return `[Tool result${block.name ? `: ${block.name}` : ""}${block.isError ? " (error)" : ""}]\n\`\`\`json\n${typeof block.output === "string" ? block.output : JSON.stringify(block.output, null, 2)}\n\`\`\``;
  if (block.type === "empty") return `[Empty message${block.reason ? `: ${block.reason}` : ""}]`;
  return `[Unrecognised exported content]\n\`\`\`json\n${JSON.stringify(block.raw, null, 2)}\n\`\`\``;
}

function messageText(message: UniversalMessage, options: ConversationExportOptions): string {
  const metadata: string[] = [];
  if (options.includeRoles) metadata.push(message.authorName || message.role);
  if (options.includeTimestamps && message.createdAt) metadata.push(message.createdAt);
  if (options.includeModels && message.model) metadata.push(message.model);
  const body = message.content.map(blockText).filter(Boolean).join("\n\n");
  return metadata.length ? `### ${metadata.join(" · ")}\n\n${body}` : body;
}

export function createConversationExport(conversation: UniversalConversation, messages: UniversalMessage[], options: ConversationExportOptions): string {
  const sections: string[] = [];
  if (options.includeContinuationPrompt && options.continuationPrompt.trim()) {
    sections.push(`## Continuation prompt\n\n${options.continuationPrompt.trim()}`);
  }
  if (options.includeTitle) sections.push(`# ${conversation.metadata.title}`);
  const includedMessages = messages.filter((message) => options.includeMissingPlaceholders || message.metadata?.missingFromExport !== true);
  sections.push(includedMessages.map((message) => messageText(message, options)).filter(Boolean).join("\n\n---\n\n"));
  return sections.filter(Boolean).join("\n\n").trim() + "\n";
}
