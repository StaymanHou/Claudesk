// Inlined folder mark for the right-panel "Reveal in Finder" launcher button.
//
// A simple, recognizable folder glyph drawn with `currentColor` so it tints to the
// dark tab row's text color and its hover state — no raster asset, no dependency on
// any installed app. `aria-hidden`: the accessible label lives on the wrapping
// <button> (see RightPanelHost). Mirrors the SublimeText/Merge icon component shape.

interface IconProps {
  /** Pixel size of the square icon. Defaults to the tab-row size. */
  size?: number;
}

export function FinderIcon({ size = 16 }: IconProps) {
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
      {/* A folder with a raised tab — the universal "open folder" mark. */}
      <path d="M2 4.5a1 1 0 0 1 1-1h3l1.4 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z" />
    </svg>
  );
}
