// WP8 — inlined Sublime Text mark for the right-panel launcher button.
//
// A simple, recognizable stand-in for the Sublime Text logo (the angled stacked
// "pages"/chevron motif) drawn with `currentColor` so it tints to the dark tab
// row's text color and its hover state — no raster asset, no dependency on the
// user's locally-installed `.app` bundle. `aria-hidden`: the accessible label
// lives on the wrapping <button> (see RightPanelHost).

interface IconProps {
  /** Pixel size of the square icon. Defaults to the tab-row size. */
  size?: number;
}

export function SublimeTextIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Three stacked angled bars evoking Sublime Text's slanted-stack mark. */}
      <path
        d="M12.5 2.2 3.5 5v3.1l9-2.8v2.2l-9 2.8V13l9-2.8V2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}
