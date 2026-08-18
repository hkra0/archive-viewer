import type { FormatAdapter } from "./adapter";
import type { UniversalAttachment, UniversalMessage } from "../domain/conversation";
import { attachmentFromFile } from "./helpers";
import { createId } from "../lib/ids";
import { toIsoDate } from "../lib/dates";

interface GeminiActivity {
  conversationId: string;
  sourceUrl: string;
  prompt: string;
  answer: string;
  createdAt?: string;
  attachmentPaths: string[];
  sourceIndex: number;
}

const CELL_PATTERN = /<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">([\s\S]*?)<\/div><div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1 mdl-typography--text-right">[\s\S]*?<\/div><div class="content-cell mdl-cell mdl-cell--12-col mdl-typography--caption">([\s\S]*?)<\/div>/gi;

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const point = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function htmlToText(value: string): string {
  return decodeHtml(value
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|pre|table|tr)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, ""))
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function geminiDate(value: string): string | undefined {
  const chinese = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2}):(\d{2})\s+CST/i);
  if (chinese) {
    const [, year, month, day, hour, minute, second] = chinese;
    return toIsoDate(`${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}T${hour!.padStart(2, "0")}:${minute}:${second}+08:00`);
  }
  return toIsoDate(value.replace(/\bCST\b/i, "GMT+0800"));
}

function activitiesFromHtml(html: string): GeminiActivity[] {
  const activities: GeminiActivity[] = [];
  for (const match of html.matchAll(CELL_PATTERN)) {
    const body = match[1] || "";
    const caption = match[2] || "";
    const url = caption.match(/https:\/\/gemini\.google\.com\/app\/([a-z0-9_-]+)/i);
    if (!url) continue;
    const answerStart = body.search(/<(?:p|h[1-6]|ul|ol|blockquote|pre|table)\b/i);
    if (answerStart < 0) continue;
    const preamble = body.slice(0, answerStart);
    const lines = preamble.split(/<br\s*\/?>/i).map(htmlToText).filter(Boolean);
    const promptLine = lines[0] || "";
    const prompt = promptLine.replace(/^Prompted\s*/i, "").trim();
    const dateLine = [...lines].reverse().find((line) => /\d{4}|\b(?:AM|PM)\b/i.test(line));
    const attachmentPaths = [...preamble.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map((link) => decodeHtml(link[1] || ""));
    const answer = htmlToText(body.slice(answerStart));
    if (!prompt && !answer) continue;
    activities.push({
      conversationId: url[1]!,
      sourceUrl: url[0],
      prompt,
      answer,
      createdAt: dateLine ? geminiDate(dateLine) : undefined,
      attachmentPaths,
      sourceIndex: activities.length,
    });
  }
  return activities;
}

function findAttachment(input: Parameters<FormatAdapter["parse"]>[0], relativePath: string): [string, File] | undefined {
  const directory = input.name.includes("/") ? input.name.slice(0, input.name.lastIndexOf("/") + 1) : "";
  const expected = `${directory}${relativePath}`;
  const exact = input.attachments?.get(expected);
  if (exact) return [expected, exact];
  return [...(input.attachments?.entries() || [])].find(([path]) => path === relativePath || path.endsWith(`/${relativePath}`));
}

export const geminiAdapter: FormatAdapter = {
  id: "gemini",
  displayName: "Gemini",
  detect(input) {
    if (!/\.html?$/i.test(input.name)) return { supported: false, confidence: 0, reason: "Not HTML" };
    const supported = /gemini/i.test(input.name) || /gemini\.google\.com\/app\//i.test(input.text) || />Gemini Apps</i.test(input.text);
    return supported
      ? { supported: true, confidence: 1, reason: "Google Takeout Gemini activity HTML" }
      : { supported: false, confidence: 0, reason: "No Gemini Takeout fields" };
  },
  parse(input) {
    const grouped = new Map<string, GeminiActivity[]>();
    for (const activity of activitiesFromHtml(input.text)) grouped.set(activity.conversationId, [...(grouped.get(activity.conversationId) || []), activity]);
    const conversations = [...grouped.entries()].map(([conversationId, sourceActivities]) => {
      const activities = [...sourceActivities].sort((a, b) => {
        if (a.createdAt && b.createdAt) return a.createdAt.localeCompare(b.createdAt);
        return b.sourceIndex - a.sourceIndex;
      });
      const attachments: UniversalAttachment[] = [];
      const attachmentByPath = new Map<string, UniversalAttachment>();
      const messages: UniversalMessage[] = [];
      for (const [index, activity] of activities.entries()) {
        const userId = `${conversationId}:${activity.createdAt || index}:user`;
        const blocks: UniversalMessage["content"] = activity.prompt ? [{ type: "markdown", markdown: activity.prompt }] : [];
        const attachmentIds: string[] = [];
        for (const relativePath of activity.attachmentPaths) {
          const found = findAttachment(input, relativePath);
          if (!found) continue;
          let attachment = attachmentByPath.get(found[0]);
          if (!attachment) {
            attachment = attachmentFromFile(found[1], found[0]);
            attachmentByPath.set(found[0], attachment);
            attachments.push(attachment);
          }
          attachmentIds.push(attachment.id);
          blocks.push(/^image\//.test(attachment.mimeType || "") || /\.(?:png|jpe?g|gif|webp)$/i.test(relativePath)
            ? { type: "image", attachmentId: attachment.id, alt: found[1].name }
            : { type: "file", attachmentId: attachment.id });
        }
        const previousId = messages.at(-1)?.id;
        if (blocks.length) messages.push({ id: userId, sourceMessageId: userId, role: "user", content: blocks, createdAt: activity.createdAt, parentMessageId: previousId, attachmentIds: attachmentIds.length ? attachmentIds : undefined });
        if (activity.answer) {
          const assistantId = `${conversationId}:${activity.createdAt || index}:assistant`;
          messages.push({ id: assistantId, sourceMessageId: assistantId, role: "assistant", content: [{ type: "markdown", markdown: activity.answer }], createdAt: activity.createdAt, parentMessageId: blocks.length ? userId : previousId });
        }
      }
      return {
        id: createId("conversation"),
        provider: { id: "gemini", name: "Gemini", sourceFormat: "Google Takeout HTML" },
        metadata: {
          title: activities.find((activity) => activity.prompt)?.prompt || "Untitled conversation",
          createdAt: activities.find((activity) => activity.createdAt)?.createdAt,
          updatedAt: [...activities].reverse().find((activity) => activity.createdAt)?.createdAt,
          sourceConversationId: conversationId,
          sourceUrl: activities[0]?.sourceUrl,
        },
        messages,
        attachments,
      };
    });
    return { conversations, warnings: [] };
  },
};
