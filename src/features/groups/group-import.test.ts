import { describe, expect, it } from "vitest";
import type { ImportReport } from "../import/import-pipeline";
import { mergeImportIntoGroup, suggestedGroupName } from "./group-import";

function report(sourceType: ImportReport["sourceType"], sourceFiles = 2): ImportReport {
  return {
    archive: {
      schemaVersion: "1.0",
      conversations: [{
        id: "conversation-1", provider: { id: "chatgpt", name: "ChatGPT" }, metadata: { title: "Test" }, messages: [], attachments: [],
      }],
      sourceFiles: Array.from({ length: sourceFiles }, (_, index) => ({ name: `export-${index}.json`, size: 1 })),
    },
    warnings: [], errors: [], sourceType,
  };
}

describe("suggestedGroupName", () => {
  it("uses the active locale for generic import names", () => {
    expect(suggestedGroupName(report("folder"), "zh-CN")).toBe("ChatGPT 导入");
    expect(suggestedGroupName(report("folder"), "en")).toBe("ChatGPT import");
  });

  it("uses a localised default name for a single file conversation", () => {
    expect(suggestedGroupName(report("files", 1), "zh-CN")).toBe("默认分组");
    expect(suggestedGroupName(report("files", 1), "en")).toBe("Default group");
  });

  it("persists the localised fallback name when creating a group", () => {
    expect(mergeImportIntoGroup(undefined, report("folder"), undefined, "en").group.name).toBe("ChatGPT import");
  });

  it("prefers available account identity over the default single-file name", () => {
    const withName = { ...report("files", 1), account: { displayName: "Grace", email: "grace@example.com" } };
    expect(suggestedGroupName(withName, "en")).toBe("Grace");
    const withEmail = { ...report("files", 1), account: { email: "grace@example.com" } };
    expect(suggestedGroupName(withEmail, "en")).toBe("grace@example.com");
  });
});
