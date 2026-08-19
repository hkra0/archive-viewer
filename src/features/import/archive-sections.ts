import type { ArchiveRecord, ArchiveSection } from "../../domain/conversation";
import type { ImportCandidate } from "../../adapters/adapter";
import { createId } from "../../lib/ids";
import { toIsoDate } from "../../lib/dates";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function first(value: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const found = text(value[key]);
    if (found) return found;
  }
  return undefined;
}

function providerFromName(name: string): string | undefined {
  if (/claude/i.test(name)) return "claude";
  if (/grok|prod-mc/i.test(name)) return "grok";
  if (/gemini/i.test(name)) return "gemini";
  if (/deepseek/i.test(name)) return "deepseek";
  if (/chatgpt|openai/i.test(name)) return "chatgpt";
  return undefined;
}

const PROFILE_FIELDS: Array<[string, string[]]> = [
  ["Name", ["full_name", "display_name", "displayName", "givenName", "name", "username"]],
  ["Email", ["email", "email_address", "emailAddress"]],
  ["Phone", ["verified_phone_number", "phone", "phone_number"]],
  ["Username", ["xUsername"]],
  ["User ID", ["user_id", "userId", "uuid", "account_uuid", "id"]],
  ["Locale", ["locale", "language"]],
  ["Plan", ["plan", "subscription", "account_type", "sessionTierId", "xSubscriptionType"]],
];

function profileItem(value: JsonRecord): ArchiveRecord | undefined {
  const candidates = [value, record(value.user), record(value.account), record(value.profile), record(value.data)].filter((item): item is JsonRecord => Boolean(item));
  const fields: Record<string, string> = {};
  for (const candidate of candidates) {
    for (const [label, keys] of PROFILE_FIELDS) fields[label] ||= first(candidate, keys) || "";
  }
  Object.keys(fields).forEach((key) => { if (!fields[key]) delete fields[key]; });
  if (!Object.keys(fields).length) return undefined;
  return { id: createId("profile"), title: fields.Name || fields.Email, fields };
}

function itemFromRecord(value: JsonRecord, kind: ArchiveSection["kind"]): ArchiveRecord {
  const title = first(value, ["name", "title", "task_name", "label"]);
  const bodyKeys = kind === "projects" ? ["description", "instructions", "prompt"]
    : kind === "tasks" ? ["description", "prompt", "instructions", "task"]
      : ["content", "text", "memory", "instructions", "description"];
  const body = first(value, bodyKeys);
  const fields: Record<string, string> = {};
  for (const [label, keys] of [
    ["Status", ["status", "state"]], ["Schedule", ["schedule", "recurrence", "rrule"]],
    [kind === "tasks" ? "Task ID" : "Project ID", [kind === "tasks" ? "task_id" : "project_id", "project_uuid", "uuid", "id"]], ["Model", ["model", "model_name"]],
  ] as Array<[string, string[]]>) {
    const found = first(value, keys); if (found) fields[label] = found;
  }
  return {
    id: first(value, ["id", "uuid", "project_id", "task_id"]) || createId(kind), title, body,
    fields: Object.keys(fields).length ? fields : undefined,
    createdAt: toIsoDate(value.created_at ?? value.create_time ?? value.createdAt),
    updatedAt: toIsoDate(value.updated_at ?? value.modify_time ?? value.updatedAt),
  };
}

function claudeProjectItem(value: JsonRecord): ArchiveRecord {
  const documents = [value.docs, value.documents, value.knowledge_docs, value.files]
    .find((candidate) => Array.isArray(candidate)) as unknown[] | undefined;
  const documentText = (documents || []).flatMap((candidate, index) => {
    const item = record(candidate);
    if (!item) return [];
    const title = first(item, ["file_name", "filename", "name", "title"]) || `Document ${index + 1}`;
    const body = first(item, ["content", "text", "extracted_content"]);
    return body ? [`## ${title}\n\n${body}`] : [`## ${title}`];
  }).join("\n\n");
  const prompt = first(value, ["prompt_template", "instructions", "prompt", "description"]);
  return {
    id: first(value, ["uuid", "id", "project_uuid"]) || createId("projects"),
    title: first(value, ["name", "title"]) || "Untitled project",
    body: [prompt, documentText].filter(Boolean).join("\n\n") || undefined,
    fields: first(value, ["uuid", "id", "project_uuid"]) ? { "Project ID": first(value, ["uuid", "id", "project_uuid"])! } : undefined,
    createdAt: toIsoDate(value.created_at ?? value.createdAt),
    updatedAt: toIsoDate(value.updated_at ?? value.updatedAt),
  };
}

function jsonSections(candidate: ImportCandidate, parsed: unknown): ArchiveSection[] {
  const name = candidate.name;
  const providerId = providerFromName(name);
  const lower = name.toLowerCase();
  const result: ArchiveSection[] = [];
  const values = Array.isArray(parsed) ? parsed : [parsed];
  const root = record(parsed);

  if (/(?:^|\/)(?:users?|account|profile|user[_-]?info)\.json$/i.test(name) || /auth-mgmt-api\.json$/i.test(name)) {
    const items = values.map(record).filter((item): item is JsonRecord => Boolean(item)).map(profileItem).filter((item): item is ArchiveRecord => Boolean(item));
    if (items.length) result.push({ id: `${providerId || "archive"}-profile`, kind: "profile", providerId, items });
  }

  if (/(?:^|\/)(?:(?:gemini[_-])?(?:memories|memory|saved[_-]?info)(?:[_-]data)?)\.json$/i.test(name)) {
    const items = values.flatMap((value) => {
      const direct = text(value);
      if (direct) return [{ id: createId("memory"), body: direct }];
      const item = record(value);
      if (!item) return [];
      const result: ArchiveRecord[] = [];
      const body = first(item, ["conversations_memory", "saved_info", "savedInfo", "memory", "content", "text"]);
      if (body) result.push({ id: first(item, ["id", "uuid", "account_uuid"]) || createId("memory"), title: "Global memory", body });
      const projectMemories = record(item.project_memories);
      if (projectMemories) Object.entries(projectMemories).forEach(([projectId, memory]) => {
        const memoryRecord = record(memory);
        const memoryBody = text(memory) || (memoryRecord && first(memoryRecord, ["memory", "content", "text"]));
        if (memoryBody) result.push({ id: `project-memory-${projectId}`, title: memoryRecord && first(memoryRecord, ["project_name", "name", "title"]) || `Project ${projectId}`, body: memoryBody, fields: { "Project ID": projectId } });
      });
      return result;
    });
    if (items.length) result.push({ id: `${providerId || "archive"}-memories`, kind: "memories", providerId, items });
  }

  if (/(?:^|\/)projects\/[0-9a-f-]+\.json$/i.test(name) && root && ("prompt_template" in root || "uuid" in root)) {
    result.push({ id: "claude-projects", kind: "projects", providerId: "claude", items: [claudeProjectItem(root)] });
  }

  const addCollection = (key: string, kind: ArchiveSection["kind"]) => {
    const collection = root && Array.isArray(root[key]) ? root[key] as unknown[] : lower.endsWith(`/${key}.json`) || lower === `${key}.json` ? values : [];
    const items = collection.map(record).filter((item): item is JsonRecord => Boolean(item)).map((item) => itemFromRecord(item, kind));
    if (items.length) result.push({ id: `${providerId || "archive"}-${kind}`, kind, providerId, items });
  };
  addCollection("projects", "projects");
  addCollection("tasks", "tasks");
  addCollection("scheduled_tasks", "tasks");
  addCollection("gems", "assistants");

  if (/(?:^|\/)(?:(?:gemini[_-])?(?:custom[_-]?)?instructions(?:[_-]data)?)\.json$/i.test(name)) {
    const items = values.flatMap((value) => {
      const direct = text(value);
      if (direct) return [{ id: createId("instructions"), body: direct }];
      const item = record(value);
      return item ? [itemFromRecord(item, "instructions")] : [];
    }).filter((item) => item.title || item.body || item.fields);
    if (items.length) result.push({ id: `${providerId || "archive"}-instructions`, kind: "instructions", providerId, items });
  }
  return result;
}

function htmlSection(candidate: ImportCandidate): ArchiveSection[] {
  const match = candidate.name.match(/gemini_(gems|scheduled_actions|saved_info|memories|memory|instructions)_data\.html$/i);
  if (!match) return [];
  const plain = candidate.text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  if (!plain || /^no activity\.?$/i.test(plain)) return [];
  const pageKind = match[1]!.toLowerCase();
  const kind = pageKind === "gems" ? "assistants" : pageKind === "scheduled_actions" ? "tasks" : pageKind === "instructions" ? "instructions" : "memories";
  return [{ id: `gemini-${kind}`, kind, providerId: "gemini", items: [{ id: createId(kind), body: plain }] }];
}

export function extractArchiveSections(candidate: ImportCandidate): ArchiveSection[] {
  if (/\.html?$/i.test(candidate.name)) return htmlSection(candidate);
  if (!/\.json$/i.test(candidate.name)) return [];
  try { return jsonSections(candidate, JSON.parse(candidate.text)); } catch { return []; }
}

const UNIFIED_PROFILE_SECTION_ID = "profile";
const PROFILE_SOURCE_FIELD = "Source";
const PROVIDER_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT", claude: "Claude", grok: "Grok", gemini: "Gemini", deepseek: "DeepSeek",
};

function sourceLabels(...values: Array<string | undefined>): string | undefined {
  const labels = [...new Set(values.flatMap((value) => value?.split(" · ") || []).map((value) => value.trim()).filter(Boolean))];
  return labels.length ? labels.join(" · ") : undefined;
}

function archiveItemWithSource(item: ArchiveRecord, providerId?: string): ArchiveRecord {
  const source = sourceLabels(item.fields?.[PROFILE_SOURCE_FIELD], providerId && (PROVIDER_NAMES[providerId] || providerId));
  return source ? { ...item, fields: { ...(item.fields || {}), [PROFILE_SOURCE_FIELD]: source } } : item;
}

function profileRecordKey(item: ArchiveRecord): string {
  const fields = item.fields || {};
  const email = fields.Email?.trim().toLocaleLowerCase();
  const userId = fields["User ID"]?.trim();
  if (email || userId) return `identity:${email || ""}\u0000${userId || ""}`;
  return `details:${fields.Name?.trim().toLocaleLowerCase() || ""}\u0000${fields.Username?.trim().toLocaleLowerCase() || ""}`;
}

function mergeProfileRecord(existing: ArchiveRecord, incoming: ArchiveRecord): ArchiveRecord {
  const source = sourceLabels(existing.fields?.[PROFILE_SOURCE_FIELD], incoming.fields?.[PROFILE_SOURCE_FIELD]);
  return {
    ...existing,
    title: existing.title || incoming.title,
    body: existing.body || incoming.body,
    fields: { ...(incoming.fields || {}), ...(existing.fields || {}), ...(source ? { [PROFILE_SOURCE_FIELD]: source } : {}) },
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: existing.updatedAt || incoming.updatedAt,
  };
}

function normalizedSection(section: ArchiveSection): ArchiveSection {
  // Profile is a group-level identity, not a provider-specific navigation item.
  // Keeping one stable ID also makes /profile unambiguous after multiple imports.
  return section.kind === "profile"
    ? { ...section, id: UNIFIED_PROFILE_SECTION_ID, providerId: undefined, items: section.items.map((item) => archiveItemWithSource(item, section.providerId)) }
    : section.kind === "memories"
      ? { ...section, items: section.items.map((item) => archiveItemWithSource(item, section.providerId)) }
      : section;
}

/**
 * Profile and memory files often have generic names such as users.json.
 * When the surrounding import contains exactly one recognised provider, use
 * that unambiguous context to label otherwise anonymous archive records.
 */
export function annotateArchiveSectionSources(sections: ArchiveSection[], fallbackProviderId?: string): ArchiveSection[] {
  if (!fallbackProviderId) return sections;
  return sections.map((section) => (section.kind === "profile" || section.kind === "memories")
    ? { ...section, items: section.items.map((item) => archiveItemWithSource(item, section.providerId || fallbackProviderId)) }
    : section);
}

export function mergeArchiveSections(existing: ArchiveSection[] = [], incoming: ArchiveSection[] = []): ArchiveSection[] {
  const merged = new Map<string, ArchiveSection>();
  for (const source of [...existing, ...incoming]) {
    const section = normalizedSection(source);
    const current = merged.get(section.id);
    if (!current) {
      merged.set(section.id, { ...section, items: [] });
    }
    const target = merged.get(section.id)!;
    const seen = new Map(target.items.map((item) => [section.kind === "profile" ? profileRecordKey(item) : `${item.id}\u0000${item.title || ""}\u0000${item.body || ""}`, item]));
    for (const item of section.items) {
      const key = section.kind === "profile" ? profileRecordKey(item) : `${item.id}\u0000${item.title || ""}\u0000${item.body || ""}`;
      const duplicate = seen.get(key);
      if (!duplicate) {
        target.items.push(item);
        seen.set(key, item);
      } else if (section.kind === "profile") {
        const index = target.items.indexOf(duplicate);
        const profile = mergeProfileRecord(duplicate, item);
        target.items[index] = profile;
        seen.set(key, profile);
      }
    }
  }
  return [...merged.values()].filter((section) => section.items.length);
}
