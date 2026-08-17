export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "archive-viewer.theme";

export function readThemePreference(): ThemePreference {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export function resolvedTheme(preference: ThemePreference, media = window.matchMedia("(prefers-color-scheme: dark)")): "light" | "dark" {
  return preference === "system" ? media.matches ? "dark" : "light" : preference;
}
