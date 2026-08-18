import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "./router";

describe("app routes", () => {
  it.each([
    ["/groups/team-1/statistics", { kind: "statistics", groupId: "team-1" }],
    ["/groups/team-1/profile", { kind: "profile", groupId: "team-1" }],
    ["/groups/team-1/memories", { kind: "memories", groupId: "team-1" }],
  ] as const)("parses %s", (path, expected) => {
    expect(parseRoute(path)).toEqual(expected);
  });

  it.each([
    [{ kind: "statistics", groupId: "team 1" }, "/groups/team%201/statistics"],
    [{ kind: "profile", groupId: "team 1" }, "/groups/team%201/profile"],
    [{ kind: "memories", groupId: "team 1" }, "/groups/team%201/memories"],
  ] as const)("creates a path for %o", (route, path) => {
    expect(routePath(route)).toBe(path);
  });
});
