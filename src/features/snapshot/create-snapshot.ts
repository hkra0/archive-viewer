import type { UniversalConversation } from "../../domain/conversation";

function textOf(conversation: UniversalConversation): string[] {
  return conversation.messages.flatMap((message) => message.content.flatMap((block) => {
    if (block.type === "markdown") return [block.markdown];
    if (block.type === "text") return [block.text];
    if (block.type === "code") return [`\`${block.language || "code"}\` code shared`];
    return [];
  })).map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function select(lines: string[], pattern: RegExp, fallback: string): string {
  const match = lines.filter((line) => pattern.test(line)).slice(-4);
  return match.length ? match.map((line) => `- ${line}`).join("\n") : fallback;
}

/** A transparent local heuristic. Users can freely edit the generated Markdown. */
export function createSnapshot(conversation: UniversalConversation): string {
  const lines = textOf(conversation);
  const early = lines.slice(0, 3).map((line) => `- ${line}`).join("\n") || "- No background was extracted.";
  const current = lines.slice(-3).map((line) => `- ${line}`).join("\n") || "- No current status was extracted.";
  return `# Context Snapshot

## Background

${early}

## Important decisions

${select(lines, /\b(decide|decision|choose|chosen|adopt|must|should|决定|采用|必须)\b/i, "- No explicit decisions were detected.")}

## Completed work

${select(lines, /\b(done|completed|implemented|finished|shipped|完成|已实现)\b/i, "- No completed work was detected.")}

## Current status

${current}

## Next steps

${select(lines, /\b(next|todo|to do|follow[- ]up|remaining|需要|下一步|待办)\b/i, "- Review the current status and decide the next action.")}
`;
}
