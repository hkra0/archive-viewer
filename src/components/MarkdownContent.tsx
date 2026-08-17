import Prism from "prismjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UniversalAttachment } from "../domain/conversation";

interface MarkdownContentProps {
  markdown: string;
  attachments: UniversalAttachment[];
}

function languageFromClass(className?: string): string {
  return className?.match(/language-([\w-]+)/)?.[1] || "markup";
}

function resolveImage(source: string, attachments: UniversalAttachment[]): string {
  const decoded = decodeURIComponent(source);
  return attachments.find((item) => item.objectUrl && (item.sourcePath === decoded || item.name === decoded.split("/").pop()))?.objectUrl || source;
}

/** Markdown is rendered without raw HTML, so imported HTML and scripts cannot execute. */
export function MarkdownContent({ markdown, attachments }: MarkdownContentProps) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      code({ className, children, ...props }) {
        const language = languageFromClass(className);
        const source = String(children).replace(/\n$/, "");
        if (!className) return <code className="inline-code" {...props}>{children}</code>;
        const grammar = Prism.languages[language] || Prism.languages.markup;
        const html = Prism.highlight(source, grammar, language);
        return <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: html }} />;
      },
      img({ src, alt }) {
        if (!src) return null;
        return <img className="message-image" src={resolveImage(src, attachments)} alt={alt || "Imported attachment"} loading="lazy" />;
      },
      a({ href, children }) {
        return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
      },
    }}
  >{markdown}</ReactMarkdown>;
}
