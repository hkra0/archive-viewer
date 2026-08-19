import { describe, expect, it } from "vitest";
import { extractArchiveSections, mergeArchiveSections } from "./archive-sections";

describe("extractArchiveSections", () => {
  it("extracts Claude-style memories without treating their text as executable content", () => {
    const sections = extractArchiveSections({ name: "memories.json", text: JSON.stringify([{ account_uuid: "account-1", conversations_memory: "The user prefers concise answers." }]) });
    expect(sections).toMatchObject([{ kind: "memories", items: [{ id: "account-1", body: "The user prefers concise answers." }] }]);
  });

  it("extracts project memories and UUID-named project files", () => {
    const memories = extractArchiveSections({ name: "memories.json", text: JSON.stringify([{ conversations_memory: "Global", project_memories: { "project-1": "Project context" } }]) });
    expect(memories[0]?.items.map((item) => item.body)).toEqual(["Global", "Project context"]);
    const projects = extractArchiveSections({ name: "projects/123e4567-e89b-12d3-a456-426614174000.json", text: JSON.stringify({ uuid: "project-1", name: "Research", prompt_template: "Be rigorous", docs: [{ file_name: "brief.md", content: "Evidence" }] }) });
    expect(projects[0]).toMatchObject({ kind: "projects", providerId: "claude" });
    expect(projects[0]?.items[0]?.body).toContain("Be rigorous");
    expect(projects[0]?.items[0]?.body).toContain("Evidence");
  });

  it("extracts an allow-listed profile rather than exposing arbitrary account fields", () => {
    const sections = extractArchiveSections({ name: "users.json", text: JSON.stringify([{ uuid: "user-1", full_name: "Ada", email_address: "ada@example.com", auth_token: "secret" }]) });
    expect(sections[0]?.items[0]?.fields).toEqual({ Name: "Ada", Email: "ada@example.com", "User ID": "user-1" });
  });

  it("extracts Grok's nested user while ignoring exported sessions and API keys", () => {
    const sections = extractArchiveSections({ name: "prod-mc-auth-mgmt-api.json", text: JSON.stringify({ user: { userId: "g1", givenName: "Grace", email: "g@example.com" }, sessions: [{ sessionId: "private" }], api_keys: [{ key: "secret" }] }) });
    expect(sections[0]?.providerId).toBe("grok");
    expect(sections[0]?.items[0]?.fields).toEqual({ Name: "Grace", Email: "g@example.com", "User ID": "g1" });
  });

  it("extracts non-empty Grok projects and tasks from the conversation container", () => {
    const sections = extractArchiveSections({ name: "prod-grok-backend.json", text: JSON.stringify({ conversations: [], projects: [{ id: "p1", name: "Research", description: "Project notes" }], tasks: [{ id: "t1", title: "Review", prompt: "Review weekly", status: "active" }] }) });
    expect(sections.map((section) => section.kind)).toEqual(["projects", "tasks"]);
    expect(sections[1]?.items[0]).toMatchObject({ title: "Review", body: "Review weekly", fields: { Status: "active", "Task ID": "t1" } });
  });

  it("hides empty Gemini data pages and deduplicates merged sections", () => {
    expect(extractArchiveSections({ name: "Takeout/Gemini/gemini_gems_data.html", text: "No activity" })).toEqual([]);
    const section = { id: "memories", kind: "memories" as const, items: [{ id: "m1", body: "Remember this" }] };
    expect(mergeArchiveSections([section], [section])[0]?.items).toHaveLength(1);
  });

  it("unifies profiles from different providers into one section and deduplicates re-imports", () => {
    const chatgptProfile = { id: "chatgpt-profile", kind: "profile" as const, providerId: "chatgpt", items: [{ id: "one", title: "Ada", fields: { Name: "Ada", Email: "ada@example.com", "User ID": "chatgpt-user" } }] };
    const claudeProfile = { id: "claude-profile", kind: "profile" as const, providerId: "claude", items: [{ id: "two", title: "Ada", fields: { Name: "Ada", Email: "ada@example.com", "User ID": "claude-user" } }] };
    const repeatedChatgptProfile = { ...chatgptProfile, items: [{ id: "three", title: "Ada", fields: { Name: "Ada", Email: "ada@example.com", "User ID": "chatgpt-user", Plan: "Plus" } }] };

    const sections = mergeArchiveSections([chatgptProfile, claudeProfile], [repeatedChatgptProfile]);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: "profile", kind: "profile" });
    expect(sections[0]?.providerId).toBeUndefined();
    expect(sections[0]?.items).toHaveLength(2);
    expect(sections[0]?.items[0]?.fields).toMatchObject({ Plan: "Plus", Source: "ChatGPT" });
    expect(sections[0]?.items[1]?.fields).toMatchObject({ Source: "Claude" });
  });

  it("combines recognised sources when the same profile is imported again", () => {
    const profile = (providerId: "chatgpt" | "gemini") => ({ id: `${providerId}-profile`, kind: "profile" as const, providerId, items: [{ id: providerId, fields: { Email: "ada@example.com" } }] });

    const sections = mergeArchiveSections([profile("chatgpt")], [profile("gemini")]);

    expect(sections[0]?.items).toHaveLength(1);
    expect(sections[0]?.items[0]?.fields?.Source).toBe("ChatGPT · Gemini");
  });

  it("supports future Gemini saved-info and instructions files while hiding empty pages", () => {
    expect(extractArchiveSections({ name: "Takeout/Gemini/gemini_saved_info_data.html", text: "<div></div>" })).toEqual([]);
    expect(extractArchiveSections({ name: "Takeout/Gemini/gemini_saved_info_data.html", text: "<div>Prefers concise answers</div>" })[0]).toMatchObject({ kind: "memories", providerId: "gemini", items: [{ body: "Prefers concise answers" }] });
    expect(extractArchiveSections({ name: "Takeout/Gemini/gemini_instructions_data.json", text: JSON.stringify({ instructions: "Use Chinese" }) })[0]).toMatchObject({ kind: "instructions", providerId: "gemini", items: [{ body: "Use Chinese" }] });
  });
});
