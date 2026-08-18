import { describe, expect, it } from "vitest";
import type { ImportReport } from "../import/import-pipeline";
import type { ConversationGroup } from "./group-types";
import { resolveImportDestination } from "./group-resolution";

const groups: ConversationGroup[] = [
  { id: "personal", name: "Personal", providerIds: ["chatgpt"], account: { email: "me@example.com", displayName: "Me" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "work", name: "Work", providerIds: ["claude"], account: { email: "me@work.example", displayName: "Me" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
];

function report(account?: ImportReport["account"]): ImportReport {
  return { archive: { schemaVersion: "1.0", sourceFiles: [], conversations: [] }, warnings: [], errors: [], sourceType: "files", account };
}

describe("resolveImportDestination", () => {
  it("automatically joins one exact e-mail match", () => {
    expect(resolveImportDestination(report({ email: " ME@EXAMPLE.COM " }), groups)).toEqual({ recommendedGroupId: "personal", requiresConfirmation: false });
  });

  it("requires confirmation for a display-name-only match", () => {
    expect(resolveImportDestination(report({ displayName: "Me" }), groups)).toEqual({ requiresConfirmation: true });
  });

  it("asks before creating or merging an unmatched account", () => {
    expect(resolveImportDestination(report({ email: "new@example.com" }), groups)).toEqual({ recommendedGroupId: undefined, requiresConfirmation: true });
  });
});
