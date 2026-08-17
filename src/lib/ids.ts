/** Creates a browser-only ID without exposing original provider identifiers. */
export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
