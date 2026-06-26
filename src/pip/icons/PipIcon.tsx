// Inlined Picture-in-Picture mark for the right-panel "Toggle PiP" launcher button.
//
// The standard PiP glyph (as used by browsers + macOS video controls): an outer
// rounded rectangle (the main view) with a smaller filled rounded rectangle nested
// in the bottom-right corner (the floating mini-player). Drawn with `currentColor`
// so it tints to the dark tab row's text + hover color — no raster asset. The inner
// rect is FILLED (not just stroked) so the mini-player reads clearly at 16px.
// `aria-hidden`: the accessible label lives on the wrapping <button> (RightPanelHost).
// Mirrors the FinderIcon / SublimeText icon component shape.

interface IconProps {
  /** Pixel size of the square icon. Defaults to the tab-row size. */
  size?: number;
}

export function PipIcon({ size = 16 }: IconProps) {
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
      aria-hidden="true"
      focusable="false"
    >
      {/* Outer view — the main window. */}
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      {/* Inner floating mini-player, bottom-right — FILLED so it pops at small size. */}
      <rect
        x="8"
        y="8"
        width="5"
        height="3.5"
        rx="0.8"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
