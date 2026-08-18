import { describe, expect, it } from "vitest";
import type { UniversalConversation } from "../../domain/conversation";
import { isConversationSelected, selectedConversationIds, withConversationSelected } from "./conversation-selection";

const base = (id: string, extra?: Record<string, unknown>): UniversalConversation => ({ id, provider: { id: "test", name: "Test" }, metadata: { title: id, extra }, attachments: [], messages: [] });

describe("conversation selection", () => {
  it("persists an explicit selected marker and removes the legacy favourite marker", () => {
    const selected = withConversationSelected(base("one", { favorite: true }), true);
    expect(isConversationSelected(selected)).toBe(true);
    expect(selected.metadata.extra).toEqual({ selected: true });
  });

  it("recognises legacy favourites before they are migrated", () => {
    expect(selectedConversationIds([base("one", { favorite: true }), base("two")])).toEqual(["one"]);
  });
});
