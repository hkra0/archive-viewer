import { describe, expect, it } from "vitest";
import type { UniversalConversation } from "../../domain/conversation";
import { inspectArchive } from "./archive-health";

describe("inspectArchive", () => {
  it("summarises conversations and branches", () => {
    const conversation: UniversalConversation = {
      id: "conversation", provider: { id: "test", name: "Test" }, metadata: { title: "Health" }, attachments: [],
      messages: [
        { id: "root", role: "user", content: [{ type: "text", text: "Question" }] },
        { id: "a", role: "assistant", parentMessageId: "root", content: [{ type: "unknown", raw: { future: true } }] },
        { id: "b", role: "assistant", parentMessageId: "root", content: [{ type: "file", attachmentId: "missing" }] },
        { id: "c", role: "user", parentMessageId: "absent", content: [{ type: "empty" }], metadata: { missingFromExport: true } },
      ],
    };
    const report = inspectArchive([conversation], []);
    expect(report.totals.branches).toBe(1);
    expect(report.totals.messages).toBe(4);
  });
});
