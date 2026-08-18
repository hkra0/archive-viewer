/** Normalises known timestamp formats. Invalid values are intentionally omitted. */
export function toIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const milliseconds = typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function formatDate(value?: string, locale?: string, unknownDate = "Unknown date"): string {
  if (!value) return unknownDate;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? unknownDate : new Intl.DateTimeFormat(locale, {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}
