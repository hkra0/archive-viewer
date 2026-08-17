import { describe, expect, it } from "vitest";
import { buildConversationTree } from "./ConversationReader";
import type { UniversalMessage } from "../domain/conversation";

const message = (id: string, parentMessageId?: string): UniversalMessage => ({ id, role: "user", content: [{ type: "text", text: id }], parentMessageId });

describe("buildConversationTree", () => {
  it("keeps edited messages as siblings instead of a single chronological list", () => {
    const tree = buildConversationTree([message("original"), message("original-answer", "original"), message("edited"), message("answer", "edited")]);
    expect(tree.hasRelationships).toBe(true);
    expect(tree.roots.map(({ id }) => id)).toEqual(["original", "edited"]);
    expect(tree.childrenByParent.get("edited")?.map(({ id }) => id)).toEqual(["answer"]);
  });

  it("groups missing-parent messages by their original parent UUID", () => {
    const tree = buildConversationTree([message("root"), message("reply", "root"), message("orphan-a", "missing-parent"), message("orphan-b", "missing-parent"), message("separate", "another-missing-parent")]);
    expect(tree.roots.map(({ id }) => id)).toEqual(["root"]);
    expect(tree.detachedRootGroups.map((group) => group.messages.map(({ id }) => id))).toEqual([["orphan-a", "orphan-b"], ["separate"]]);
  });
});
