import type { FormatAdapter, ImportCandidate } from "./adapter";
import { createId } from "../lib/ids";
import { attachmentFromFile } from "./helpers";

export const genericMarkdownAdapter: FormatAdapter = {
  id: "generic-markdown",
  displayName: "Markdown",
  detect(input) {
    return { supported: /\.md(?:own)?$/i.test(input.name), confidence: 0.8, reason: "Markdown filename" };
  },
  parse(input: ImportCandidate) {
    const heading = input.text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const attachments = [...(input.attachments?.entries() || [])]
      .filter(([path, file]) => /\.(png|jpe?g|gif|webp|svg)$/i.test(path) && file.size > 0)
      .map(([path, file]) => attachmentFromFile(file, path));
    return {
      conversations: [{
        id: createId("conversation"),
        provider: { id: "generic", name: "Generic", sourceFormat: "Markdown" },
        metadata: { title: heading || input.name.replace(/\.md(?:own)?$/i, "") || "Untitled conversation" },
        messages: [{ id: createId("message"), role: "unknown", content: [{ type: "markdown", markdown: input.text }] }],
        attachments,
      }],
      warnings: [{ code: "MARKDOWN_SINGLE_MESSAGE", message: "Markdown imports are shown as one message because authors are not encoded reliably." }],
    };
  },
};
