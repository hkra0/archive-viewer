import Prism from "prismjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { UniversalAttachment } from "../domain/conversation";
import { useRef, useState, type ReactNode } from "react";

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

function CodePre({ children }: { children?: ReactNode }) {
  const pre = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return <div className="code-block-wrap"><button type="button" onClick={() => void navigator.clipboard.writeText(pre.current?.innerText || "").then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); })}>{copied ? "✓" : "Copy"}</button><pre ref={pre}>{children}</pre></div>;
}

/** Markdown is rendered without raw HTML, so imported HTML and scripts cannot execute. */
export function MarkdownContent({ markdown, attachments }: MarkdownContentProps) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={{
      pre({ children }) { return <CodePre>{children}</CodePre>; },
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
