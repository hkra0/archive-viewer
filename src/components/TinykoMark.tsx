/** Shared text-based product mark. Keep the character name as tinyko in code and UI copy. */
export const TINYKO_FACE = "(๑• . •๑)";

export function TinykoMark() {
  return <span className="tinyko-mark" role="img" aria-label="tinyko，本地 AI 对话归档">
    <svg className="tinyko-archive-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 5.5 5.2 3h13.6l1.7 2.5v3H3.5v-3Z" />
      <path d="M4.5 9h15v10.5a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5V9Z" />
      <path d="M9.5 13h5" />
    </svg>
    <span className="tinyko-face" aria-hidden="true">{TINYKO_FACE}</span>
  </span>;
}
