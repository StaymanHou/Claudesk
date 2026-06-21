// WP8 — inlined Sublime Merge mark for the right-panel launcher button.
//
// A simple, recognizable stand-in for the Sublime Merge logo (the two-branches-
// merging motif) drawn with `currentColor` so it tints to the dark tab row — no
// raster asset, no dependency on the locally-installed `.app`. `aria-hidden`: the
// accessible label lives on the wrapping <button> (see RightPanelHost).

interface IconProps {
  /** Pixel size of the square icon. Defaults to the tab-row size. */
  size?: number;
}

export function SublimeMergeIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* Two branch lines merging into one — the git-merge motif. */}
      <circle cx="4" cy="3.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M4 4.9v1.2c0 1.7 1.4 3 3 3.2M12 4.9v1.2c0 1.7-1.4 3-3 3.2" />
    </svg>
  );
}
