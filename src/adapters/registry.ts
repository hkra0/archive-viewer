import type { FormatAdapter, ImportCandidate } from "./adapter";
import { chatGptAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { genericJsonAdapter } from "./generic-json";
import { genericMarkdownAdapter } from "./generic-markdown";

const adapters: FormatAdapter[] = [chatGptAdapter, claudeAdapter, genericMarkdownAdapter, genericJsonAdapter];

export function detectAdapter(input: ImportCandidate): { adapter: FormatAdapter; reason: string } | undefined {
  const match = adapters.map((adapter) => ({ adapter, result: adapter.detect(input) }))
    .filter(({ result }) => result.supported)
    .sort((a, b) => b.result.confidence - a.result.confidence)[0];
  return match ? { adapter: match.adapter, reason: match.result.reason } : undefined;
}

export { adapters };
