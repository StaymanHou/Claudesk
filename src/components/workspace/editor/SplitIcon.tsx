// WP11 Phase 5 — inline split-editor glyph for the tab-strip Split control (replaces
// the "Split" text label, operator request). A VS Code-style "split layout" mark: a
// rounded rectangle divided into two panes by a vertical line. Drawn with
// `currentColor` so it tints to the tab-row text color + hover state (no raster
// asset). `aria-hidden`: the accessible label lives on the wrapping <button>.

interface IconProps {
  /** Pixel size of the square icon. Defaults to the tab-row size. */
  size?: number;
}

export function SplitIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <line x1="8" y1="2.75" x2="8" y2="13.25" />
    </svg>
  );
}
