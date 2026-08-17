import { describe, expect, it } from "vitest";
import { buildConversationTree } from "./ConversationReader";
import type { UniversalMessage } from "../domain/conversation";

const message = (id: string, parentMessageId?: string): UniversalMessage => ({ id, role: "user", content: [{ type: "text", text: id }], parentMessageId });

describe("buildConversationTree", () => {
  it("keeps edited messages as siblings instead of a single chronological list", () => {
    const tree = buildConversationTree([message("original", "root"), message("edited", "root"), message("answer", "edited")]);
    expect(tree.hasRelationships).toBe(true);
    expect(tree.childrenByParent.get(undefined)?.map(({ id }) => id)).toEqual(["original", "edited"]);
    expect(tree.childrenByParent.get("edited")?.map(({ id }) => id)).toEqual(["answer"]);
  });
});
