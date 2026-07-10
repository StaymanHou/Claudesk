// M9 WP6a — tiny SVG-path icon primitive for the time-analytics dashboard.
//
// Ported verbatim from dashboard.jsx (L265-279). `d` is a ReactNode of SVG
// child elements (polyline/line/path/…) drawn with a shared stroke style. The
// day-view only needs the two chevrons; the rest of the source's icon set
// (search/calendar/filter/…) lands with the WP6b toolbar, so only the chevrons
// are exported here.

import type { ReactNode } from "react";

interface IconProps {
  /** SVG child element(s) drawn inside the 16×16 viewBox. */
  d: ReactNode;
  size?: number;
}

export function Icon({ d, size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d}
    </svg>
  );
}

export function IconChevDown(p: { size?: number }) {
  return <Icon {...p} d={<polyline points="4,6 8,10 12,6" />} />;
}

export function IconChevRight(p: { size?: number }) {
  return <Icon {...p} d={<polyline points="6,4 10,8 6,12" />} />;
}
