import type { SVGProps } from "react";

export type IconName = "menu" | "chevron" | "search" | "import" | "download" | "sun" | "moon" | "system" | "trash" | "warning" | "panel" | "edit" | "plus" | "settings" | "user" | "folder" | "memory" | "tasks" | "spark" | "copy" | "chart" | "image" | "grid" | "list" | "share" | "square" | "check-square" | "select-all" | "deselect-all" | "invert" | "undo";

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  return <svg {...common} {...props}>
    {name === "menu" && <path d="M4 7h16M4 12h16M4 17h16" />}
    {name === "panel" && <path d="M4 5.5h16v13H4zM9 5.5v13M6.5 9h.01M6.5 12h.01" />}
    {name === "chevron" && <path d="m8 10 4 4 4-4" />}
    {name === "search" && <><circle cx="10.7" cy="10.7" r="5.7" /><path d="m15 15 4.2 4.2" /></>}
    {name === "import" && <><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" /></>}
    {name === "download" && <><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" /></>}
    {name === "sun" && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
    {name === "moon" && <path d="M20 15.2A8.2 8.2 0 0 1 8.8 4 8.2 8.2 0 1 0 20 15.2Z" />}
    {name === "system" && <><rect x="3.5" y="4.5" width="17" height="12" rx="1.5" /><path d="M8 20h8m-4-3.5V20" /></>}
    {name === "trash" && <><path d="M4.5 7h15M9.5 3.8h5l.8 3.2H8.7l.8-3.2ZM6.5 7l.8 13h9.4l.8-13M10 10.5v6M14 10.5v6" /></>}
    {name === "warning" && <><path d="M12 3.5 21 20H3L12 3.5Z" /><path d="M12 9v4.7m0 3h.01" /></>}
    {name === "edit" && <><path d="m4 20 4.2-.9L19 8.3a2.1 2.1 0 0 0-3-3L5.2 16.1 4 20Z" /><path d="m13.8 7.5 2.7 2.7" /></>}
    {name === "plus" && <path d="M12 5v14M5 12h14" />}
    {name === "settings" && <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.1m0 13.8V21M3 12h2.1m13.8 0H21M5.64 5.64l1.49 1.49m9.74 9.74 1.49 1.49m0-12.72-1.49 1.49m-9.74 9.74-1.49 1.49" /><circle cx="12" cy="12" r="7.25" /></>}
    {name === "user" && <><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6" /></>}
    {name === "folder" && <path d="M3.5 6.5h6l2 2h9v10h-17z" />}
    {name === "memory" && <><path d="M8 5.5A3 3 0 0 1 13 3v18a3 3 0 0 1-5-2.2A3.4 3.4 0 0 1 5.3 13 3.5 3.5 0 0 1 8 7.2Z" /><path d="M13 6a3 3 0 0 1 5 2.2A3.4 3.4 0 0 1 18.7 15 3.5 3.5 0 0 1 13 18.5M8 10h2m5 4h2" /></>}
    {name === "tasks" && <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2" /></>}
    {name === "spark" && <><path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2Z" /><path d="m18.5 14 .6 2.4 2.4.6-2.4.6-.6 2.4-.6-2.4-2.4-.6 2.4-.6Z" /></>}
    {name === "copy" && <><rect x="8.5" y="8.5" width="11" height="11" rx="1.5" /><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>}
    {name === "chart" && <><path d="M4 19.5h16M6.5 17V11m5.5 6V5m5.5 12V8" /><path d="M5 8.5 10 4l4 3 5-3.5" /></>}
    {name === "image" && <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4.5 17 4.7-4.7 3.1 3.1 2.4-2.4 4.3 4.3" /></>}
    {name === "grid" && <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>}
    {name === "list" && <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>}
    {name === "share" && <><circle cx="18" cy="5.5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="18.5" r="2" /><path d="m7.8 11 8.4-4.5M7.8 13l8.4 4.5" /></>}
    {name === "square" && <rect x="4.5" y="4.5" width="15" height="15" rx="2" />}
    {name === "check-square" && <><rect x="4.5" y="4.5" width="15" height="15" rx="2" /><path d="m8 12 2.5 2.5 5.5-5.5" /></>}
    {name === "select-all" && <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m7.5 12 2.2 2.2 4.8-4.8M16.5 5.5v-2m0 17v-2M5.5 5.5h-2m17 0h-2" /></>}
    {name === "deselect-all" && <><rect x="4.5" y="4.5" width="15" height="15" rx="2" /><path d="m8.5 8.5 7 7m0-7-7 7" /></>}
    {name === "invert" && <><path d="M5 8.5a7.5 7.5 0 0 1 12.8-2.7M19 15.5a7.5 7.5 0 0 1-12.8 2.7" /><path d="m17.8 3.5.1 2.6-2.6.1m-9.1 11.7-.1-2.6 2.6-.1" /></>}
    {name === "undo" && <><path d="M9 8 5 12l4 4" /><path d="M5.5 12H14a5 5 0 1 1 0 10h-1" /></>}
  </svg>;
}
