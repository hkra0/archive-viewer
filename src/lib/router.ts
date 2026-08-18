import { useCallback, useEffect, useState } from "react";

export type AppRoute =
  | { kind: "home" }
  | { kind: "group"; groupId: string }
  | { kind: "conversation"; groupId: string; conversationId: string };

function part(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return undefined; }
}

export function parseRoute(pathname = window.location.pathname): AppRoute {
  const segments = pathname.split("/").filter(Boolean).map(part);
  if (segments.length === 2 && segments[0] === "groups" && segments[1]) return { kind: "group", groupId: segments[1] };
  if (segments.length === 4 && segments[0] === "groups" && segments[1] && segments[2] === "conversations" && segments[3]) {
    return { kind: "conversation", groupId: segments[1], conversationId: segments[3] };
  }
  return { kind: "home" };
}

export function routePath(route: AppRoute): string {
  if (route.kind === "home") return "/";
  const group = encodeURIComponent(route.groupId);
  return route.kind === "group" ? `/groups/${group}` : `/groups/${group}/conversations/${encodeURIComponent(route.conversationId)}`;
}

export function useAppRouter(): { route: AppRoute; navigate(route: AppRoute, replace?: boolean): void } {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute());
  useEffect(() => {
    const onPopState = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const navigate = useCallback((next: AppRoute, replace = false) => {
    const path = routePath(next);
    if (path !== window.location.pathname) window.history[replace ? "replaceState" : "pushState"]({}, "", path);
    setRoute(next);
  }, []);
  return { route, navigate };
}
