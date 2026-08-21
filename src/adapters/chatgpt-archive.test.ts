import { describe, expect, it } from "vitest";
import { chatGptArchiveSections, chatGptLibraryConversation, normaliseChatGptArchiveSections } from "./chatgpt-archive";

describe("ChatGPT archive records", () => {
  it("keeps library metadata in an archive section and unreferenced packaged files in a virtual conversation", () => {
    const asset = new File([new Uint8Array([137, 80, 78, 71])], "file-library.dat", { type: "application/octet-stream" });
    const candidate = {
      name: "library_files.json",
      text: JSON.stringify([{ file_id: "file-library", file_name: "reference.png", mime_type: "image/png", state: "ready", file_size_bytes: 4 }]),
      attachments: new Map([["file-library.dat", asset]]),
      attachmentNames: new Map([["file-library.dat", "reference.png"]]),
    };
    const sections = chatGptArchiveSections(candidate);
    const library = chatGptLibraryConversation(candidate, new Set());

    expect(sections[0]).toMatchObject({ id: "chatgpt-library", kind: "library", items: [{ title: "reference.png", fields: { "File ID": "file-library" } }] });
    expect(sections[0]?.items[0]?.fields?.Status).toBeUndefined();
    expect(sections[0]?.items[0]?.body).toBeUndefined();
    expect(sections[0]?.items[0]?.raw).toMatchObject({ file_id: "file-library" });
    expect(library?.attachments).toMatchObject([{ id: "file-library", name: "reference.png", mimeType: "image/png" }]);
    expect(library?.messages[0]?.content).toEqual([{ type: "image", attachmentId: "file-library", alt: "reference.png" }]);
  });

  it("preserves supplemental data while removing credential-shaped fields", () => {
    const sections = chatGptArchiveSections({ name: "user_settings.json", text: JSON.stringify({ theme: "dark", access_token: "do-not-store" }) });
    expect(sections[0]).toMatchObject({ id: "chatgpt-other", kind: "other", providerId: "chatgpt" });
    expect(sections[0]?.items[0]?.raw).toMatchObject({ theme: "dark" });
    expect(JSON.stringify(sections[0]?.items[0]?.raw)).not.toContain("do-not-store");
  });

  it("combines legacy supplemental sections without discarding their data", () => {
    const sections = normaliseChatGptArchiveSections([{ id: "chatgpt-settings", kind: "other", providerId: "chatgpt", items: [{ id: "settings", body: '{"theme":"dark"}' }] }]);
    expect(sections).toMatchObject([{ id: "chatgpt-other", title: "其他内容", items: [{ id: "settings", raw: { theme: "dark" } }] }]);
  });

  it("does not create a standalone section for shared conversation IDs", () => {
    expect(chatGptArchiveSections({ name: "shared_conversations.json", text: JSON.stringify([{ conversation_id: "chat-1" }]) })).toEqual([]);
  });
});
