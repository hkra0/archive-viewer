import { describe, expect, it } from "vitest";
import { createSnapshot } from "./create-snapshot";
import type { UniversalConversation } from "../../domain/conversation";

describe("createSnapshot", () => {
  it("always produces the portable context headings", () => {
    const conversation: UniversalConversation = {
      id: "conversation_1", provider: { id: "generic", name: "Generic" }, metadata: { title: "Test" }, attachments: [],
      messages: [{ id: "message_1", role: "user", content: [{ type: "markdown", markdown: "We decided to use a local parser. Next: add tests." }] }],
    };
    const snapshot = createSnapshot(conversation);
    expect(snapshot).toContain("# Context Snapshot");
    expect(snapshot).toContain("## Important decisions");
    expect(snapshot).toContain("## Next steps");
  });
});
