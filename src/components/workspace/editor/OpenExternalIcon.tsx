// Inlined "open in another app" mark for the right-panel "Open in default app" launcher (M16
// WP2, R-4b): a box with an arrow leaving its corner, the common external-open glyph. Drawn
// with `currentColor` like the Finder/Sublime launcher icons so it tints with the tab row;
// `aria-hidden` because the label lives on the wrapping <button>.

interface IconProps {
  /** Pixel size of the square icon. Defaults to the tab-row size. */
  size?: number;
}

export function OpenExternalIcon({ size = 16 }: IconProps) {
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
      <path d="M7 3H3.5a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1H12a1 1 0 0 0 1-1V9" />
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5 7.5 8.5" />
    </svg>
  );
}
